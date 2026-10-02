import os from "node:os";
import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import { safeStorage } from "electron";
import type {
  ChangePasswordRequest,
  LoginRequest,
  Permission,
  SessionInfo,
  SessionMember,
  UnlockRequest,
} from "../../shared/contracts";
import {
  CloudClient,
  type LoginResponse,
  type PermissionSnapshotResponse,
} from "../cloud";
import type { LocalDatabase } from "../database/client";
import type { Device } from "../generated/prisma/client";
import { PosError } from "../errors";
import { elapsedLeaseMs, type LeaseClockReading } from "./leaseClock";
import type { ConnectivityService } from "./syncService";

const LEASE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export class SessionService {
  private member: SessionMember | null = null;
  private state: "signed-out" | "active" | "locked" = "signed-out";
  private lockReason: string | null = null;
  private leaseAnchor: LeaseClockReading | null = null;
  private leaseValidatedAt: string | null = null;
  private snapshotToken: string | null = null;
  private storeId: string | null = null;
  private device: Device | null = null;
  private connectivity: ConnectivityService | null = null;
  private readonly listeners = new Set<(session: SessionInfo) => void>();

  constructor(
    private readonly database: LocalDatabase,
    private readonly cloud: CloudClient,
  ) {}

  attachConnectivity(connectivity: ConnectivityService): void {
    this.connectivity = connectivity;
  }

  onChange(listener: (session: SessionInfo) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    const info = this.getInfo();
    for (const listener of this.listeners) listener(info);
  }

  async initializeDevice(): Promise<void> {
    let installationId = (
      await this.database.setting.findUnique({
        where: { key: "installationId" },
      })
    )?.value;
    if (!installationId) {
      installationId = randomUUID();
      await this.database.setting.upsert({
        where: { key: "installationId" },
        create: { key: "installationId", value: installationId },
        update: { value: installationId },
      });
    }
    this.device = await this.database.device.findUnique({
      where: { installationId },
    });
    if (!this.device) {
      this.device = await this.database.device.create({
        data: {
          id: randomUUID(),
          installationId,
          terminalCode: null,
          storeId: null,
          encryptedSecret: null,
          registeredAt: null,
        },
      });
    }
  }

  getInfo(): SessionInfo {
    return {
      state: this.state,
      member: this.member,
      lockReason: this.lockReason,
      connectivity: this.connectivity?.getStatus() ?? {
        state: "offline",
        lastCheckedAt: null,
        lastSyncAt: null,
        offlineLeaseExpiresAt: null,
        offlineLeaseRemainingMs: null,
        pendingOutboxCount: 0,
        permanentErrorCount: 0,
        conflictCount: 0,
        message: "Checking connection…",
      },
    };
  }

  getMember(): SessionMember {
    if (!this.member)
      throw new PosError("AUTH_REQUIRED", "Please sign in to continue.");
    return this.member;
  }

  getStoreId(): string {
    if (!this.storeId)
      throw new PosError(
        "AUTH_REQUIRED",
        "No store is associated with this session.",
      );
    return this.storeId;
  }

  getDevice(): Device {
    if (!this.device)
      throw new PosError(
        "POS_IPC_ERROR",
        "The terminal has not been initialized.",
      );
    return this.device;
  }

  getSnapshotToken(): string | null {
    return this.snapshotToken;
  }

  hasPermission(permission: Permission): boolean {
    return (
      this.member?.role === "owner" ||
      Boolean(this.member?.permissions.includes(permission))
    );
  }

  requirePermission(permission: Permission): void {
    this.assertUsable();
    if (!this.hasPermission(permission))
      throw new PosError(
        "FORBIDDEN",
        "You do not have permission for this operation.",
      );
  }

  assertUsable(): void {
    this.assertAuthenticated();
    if (this.member?.mustChangePassword) {
      throw new PosError(
        "AUTH_REQUIRED",
        "Change the temporary password before using the POS.",
      );
    }
  }

  private assertAuthenticated(): void {
    this.checkLease();
    if (this.state === "signed-out")
      throw new PosError("AUTH_REQUIRED", "Please sign in to continue.");
    if (this.state === "locked")
      throw new PosError(
        "SESSION_LOCKED",
        this.lockReason ?? "This session is locked.",
      );
  }

  getRemainingLeaseMs(): number | null {
    if (!this.leaseAnchor) return null;
    const elapsed = this.elapsedSinceValidation();
    return Math.max(0, LEASE_DURATION_MS - elapsed);
  }

  getLeaseExpiresAt(): string | null {
    if (!this.leaseValidatedAt) return null;
    return new Date(
      Date.parse(this.leaseValidatedAt) + LEASE_DURATION_MS,
    ).toISOString();
  }

  checkLease(): void {
    if (this.state !== "active" || !this.leaseAnchor) return;
    if (this.elapsedSinceValidation() >= LEASE_DURATION_MS) {
      this.state = "locked";
      this.lockReason =
        "Your seven-day offline session has expired. Connect to the internet and enter your password.";
      this.emit();
    }
  }

  private elapsedSinceValidation(): number {
    if (!this.leaseAnchor) return Number.POSITIVE_INFINITY;
    return elapsedLeaseMs(this.leaseAnchor, {
      wallMs: Date.now(),
      performanceMs: performance.now(),
      uptimeMs: os.uptime() * 1000,
    });
  }

  private renewLease(validatedAt = new Date().toISOString()): void {
    this.leaseValidatedAt = validatedAt;
    this.leaseAnchor = {
      wallMs: Date.now(),
      performanceMs: performance.now(),
      uptimeMs: os.uptime() * 1000,
    };
    this.state = "active";
    this.lockReason = null;
  }

  private decryptSecret(): string | null {
    const encrypted = this.device?.encryptedSecret;
    if (!encrypted || !safeStorage.isEncryptionAvailable()) return null;
    try {
      return safeStorage.decryptString(Buffer.from(encrypted, "base64"));
    } catch {
      return null;
    }
  }

  private async applyLogin(response: LoginResponse): Promise<void> {
    const device = this.getDevice();
    const previousDeviceId = device.id;
    device.id = response.device.id;
    device.terminalCode = response.device.terminalCode;
    device.storeId = response.storeId;
    device.registeredAt ??= new Date().toISOString();
    if (response.device.secret && safeStorage.isEncryptionAvailable()) {
      device.encryptedSecret = safeStorage
        .encryptString(response.device.secret)
        .toString("base64");
    }
    if (previousDeviceId !== device.id) {
      await this.database.device.deleteMany({
        where: { id: previousDeviceId },
      });
    }
    await this.database.device.upsert({
      where: { id: device.id },
      create: device,
      update: device,
    });

    this.member = response.member;
    this.storeId = response.storeId;
    this.snapshotToken = response.permissionSnapshot.token;
    const permissionSnapshot = {
      memberId: response.member.id,
      permissionsJson: JSON.stringify(response.member.permissions),
      signedToken: response.permissionSnapshot.token,
      version: response.permissionSnapshot.version,
      issuedAt: response.permissionSnapshot.issuedAt,
      lastValidatedAt: new Date().toISOString(),
    };
    await this.database.permissionSnapshot.upsert({
      where: { id: response.permissionSnapshot.id },
      create: { id: response.permissionSnapshot.id, ...permissionSnapshot },
      update: permissionSnapshot,
    });
    this.renewLease();
    this.emit();
  }

  async login(request: LoginRequest): Promise<SessionInfo> {
    if (!request.employeeId.trim() || !request.password) {
      throw new PosError(
        "VALIDATION_ERROR",
        "Employee ID and password are required.",
      );
    }
    const device = this.getDevice();
    if (!safeStorage.isEncryptionAvailable()) {
      throw new PosError(
        "POS_IPC_ERROR",
        "Secure operating-system storage is unavailable, so this terminal cannot be activated safely.",
      );
    }
    const response = await this.cloud.login(
      request,
      device.installationId,
      this.decryptSecret(),
    );
    await this.applyLogin(response);
    return this.getInfo();
  }

  async unlock(request: UnlockRequest): Promise<SessionInfo> {
    const member = this.getMember();
    if (!request.password)
      throw new PosError("VALIDATION_ERROR", "Password is required.");
    const response = await this.cloud.unlock(
      member.employeeId,
      request.password,
      this.getDevice().installationId,
      this.decryptSecret(),
    );
    if (response.member.id !== member.id)
      throw new PosError(
        "AUTH_REQUIRED",
        "Unlock must use the current employee.",
      );
    await this.applyLogin(response);
    return this.getInfo();
  }

  async renewFromValidation(
    member: SessionMember,
    snapshot?: PermissionSnapshotResponse,
  ): Promise<void> {
    if (!this.member || member.id !== this.member.id) {
      this.lock("The current employee is no longer authorized.");
      return;
    }
    this.member = member;
    if (snapshot) {
      this.snapshotToken = snapshot.token;
      const permissionSnapshot = {
        memberId: member.id,
        permissionsJson: JSON.stringify(member.permissions),
        signedToken: snapshot.token,
        version: snapshot.version,
        issuedAt: snapshot.issuedAt,
        lastValidatedAt: new Date().toISOString(),
      };
      await this.database.permissionSnapshot.upsert({
        where: { id: snapshot.id },
        create: { id: snapshot.id, ...permissionSnapshot },
        update: permissionSnapshot,
      });
    }
    this.renewLease();
    this.emit();
  }

  lock(reason: string): void {
    if (!this.member) return;
    this.state = "locked";
    this.lockReason = reason;
    this.emit();
  }

  async changePassword(request: ChangePasswordRequest): Promise<SessionInfo> {
    this.assertAuthenticated();
    if (request.newPassword.length < 10) {
      throw new PosError(
        "VALIDATION_ERROR",
        "The new password must contain at least 10 characters.",
      );
    }
    if (request.newPassword !== request.confirmPassword) {
      throw new PosError("VALIDATION_ERROR", "Passwords do not match.");
    }
    const member = await this.cloud.changePassword(request.newPassword);
    await this.renewFromValidation(member);
    return this.getInfo();
  }

  async logout(): Promise<SessionInfo> {
    await this.cloud.clearSession();
    this.member = null;
    this.storeId = null;
    this.snapshotToken = null;
    this.leaseAnchor = null;
    this.leaseValidatedAt = null;
    this.state = "signed-out";
    this.lockReason = null;
    this.emit();
    return this.getInfo();
  }
}

export { LEASE_DURATION_MS };
