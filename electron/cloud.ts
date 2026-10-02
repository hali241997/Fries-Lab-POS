import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  LoginRequest,
  MemberSummary,
  MenuItem,
  MenuMutationRequest,
  SaveMemberRequest,
  SessionMember,
} from "../shared/contracts";
import { PosError } from "./errors";

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  member: SessionMember;
  storeId: string;
  permissionSnapshot: {
    id: string;
    token: string;
    version: number;
    issuedAt: string;
  };
  device: { id: string; terminalCode: string; secret?: string };
}

interface PermissionSnapshotResponse {
  id: string;
  token: string;
  version: number;
  issuedAt: string;
}

interface SyncResponse {
  cursor: string;
  acceptedOperationIds: string[];
  permanentErrors: Array<{ operationId: string; message: string }>;
  changes: Array<{
    sequence: string;
    entityType: string;
    entityId: string;
    operation: string;
    payload: unknown;
  }>;
  member?: SessionMember;
  permissionSnapshot?: PermissionSnapshotResponse;
}

interface PasswordChangeResponse {
  member: SessionMember;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface CloudConfig {
  url: string;
  publishableKey: string;
}

export class CloudClient {
  private readonly client: SupabaseClient | null;
  private accessToken: string | null = null;
  private expiresAtMs = 0;

  constructor(config?: CloudConfig) {
    const url = process.env.SUPABASE_URL || config?.url;
    const key =
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      config?.publishableKey;
    this.client =
      url && key
        ? createClient(url, key, {
            auth: {
              persistSession: false,
              autoRefreshToken: false,
              detectSessionInUrl: false,
            },
          })
        : null;
  }

  get configured(): boolean {
    return this.client !== null;
  }

  private requireClient(): SupabaseClient {
    if (!this.client) {
      throw new PosError(
        "ONLINE_REQUIRED",
        "Online services are unavailable. Please contact support.",
      );
    }
    return this.client;
  }

  private async invoke<T>(
    name: string,
    body: Record<string, unknown>,
    authenticated = true,
  ): Promise<T> {
    const client = this.requireClient();
    if (
      authenticated &&
      this.accessToken &&
      Date.now() > this.expiresAtMs - 60_000
    ) {
      const refreshed = await client.auth.refreshSession();
      if (refreshed.error || !refreshed.data.session)
        throw new PosError("AUTH_REQUIRED", "The server session has expired.");
      this.accessToken = refreshed.data.session.access_token;
      this.expiresAtMs = (refreshed.data.session.expires_at ?? 0) * 1000;
    }
    const headers =
      authenticated && this.accessToken
        ? { Authorization: `Bearer ${this.accessToken}` }
        : undefined;
    const { data, error } = await client.functions.invoke<T>(name, {
      body,
      headers,
    });
    if (error) {
      const status = (error as { context?: { status?: number } }).context
        ?.status;
      if (status === 401 || status === 429) {
        throw new PosError(
          "AUTH_REQUIRED",
          name === "employee-login"
            ? "Invalid employee ID or password."
            : "The employee session is no longer valid.",
        );
      }
      if (status === 403)
        throw new PosError(
          "FORBIDDEN",
          "You do not have permission to do that.",
        );
      if (status === 409)
        throw new PosError(
          "CONFLICT",
          "The record changed on another terminal. Refresh and try again.",
        );
      if (status === 400)
        throw new PosError(
          "VALIDATION_ERROR",
          "Please check the information and try again.",
        );
      throw new PosError(
        "SYNC_ERROR",
        "We could not reach the online service. Check your connection and try again.",
      );
    }
    if (data === null)
      throw new PosError(
        "SYNC_ERROR",
        "We could not complete the request. Please try again.",
      );
    return data;
  }

  async login(
    request: LoginRequest,
    installationId: string,
    deviceSecret: string | null,
  ): Promise<LoginResponse> {
    const response = await this.invoke<LoginResponse>(
      "employee-login",
      {
        employeeId: request.employeeId.trim().toUpperCase(),
        password: request.password,
        installationId,
        deviceSecret,
      },
      false,
    );
    this.accessToken = response.accessToken;
    this.expiresAtMs = Date.now() + response.expiresIn * 1000;
    const client = this.requireClient();
    const { error } = await client.auth.setSession({
      access_token: response.accessToken,
      refresh_token: response.refreshToken,
    });
    if (error)
      throw new PosError(
        "AUTH_REQUIRED",
        "The server session could not be established.",
      );
    return response;
  }

  async unlock(
    employeeId: string,
    password: string,
    installationId: string,
    deviceSecret: string | null,
  ): Promise<LoginResponse> {
    return this.login({ employeeId, password }, installationId, deviceSecret);
  }

  async validate(): Promise<SessionMember> {
    return this.invoke<SessionMember>("validate-session", {});
  }

  async changePassword(newPassword: string): Promise<SessionMember> {
    const response = await this.invoke<PasswordChangeResponse>(
      "change-password",
      { newPassword },
    );
    this.accessToken = response.accessToken;
    this.expiresAtMs = Date.now() + response.expiresIn * 1000;
    const { error } = await this.requireClient().auth.setSession({
      access_token: response.accessToken,
      refresh_token: response.refreshToken,
    });
    if (error)
      throw new PosError(
        "AUTH_REQUIRED",
        "The refreshed session could not be established.",
      );
    return response.member;
  }

  async saveMenu(
    request: MenuMutationRequest & { action: "create" | "update" | "archive" },
  ): Promise<MenuItem> {
    return this.invoke<MenuItem>("menu-admin", { ...request });
  }

  async getMembers(): Promise<MemberSummary[]> {
    return this.invoke<MemberSummary[]>("member-admin", { action: "list" });
  }

  async saveMember(request: SaveMemberRequest): Promise<MemberSummary> {
    return this.invoke<MemberSummary>("member-admin", {
      action: "save",
      member: request,
    });
  }

  async deactivateMember(id: string): Promise<void> {
    await this.invoke<{ success: true }>("member-admin", {
      action: "deactivate",
      id,
    });
  }

  async sync(payload: Record<string, unknown>): Promise<SyncResponse> {
    return this.invoke<SyncResponse>("sync", payload);
  }

  async ping(): Promise<void> {
    await this.invoke<{ ok: true }>("health", {}, false);
  }

  async clearSession(): Promise<void> {
    this.accessToken = null;
    this.expiresAtMs = 0;
    if (this.client) await this.client.auth.signOut({ scope: "local" });
  }
}

export type { LoginResponse, PermissionSnapshotResponse, SyncResponse };
