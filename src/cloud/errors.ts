export type CloudErrorCode =
  | "CLOUD_NOT_CONFIGURED"
  | "AUTH_REQUIRED"
  | "CLOUD_MISSION_SAVE_FAILED"
  | "CLOUD_MISSION_LOAD_FAILED"
  | "CLOUD_RESULT_SAVE_FAILED"
  | "MISSION_NOT_FOUND"
  | "SNAPSHOT_ALREADY_EXISTS"
  | "SNAPSHOT_CONTEXT_MISMATCH"
  | "SNAPSHOT_INVALID_TYPE"
  | "SNAPSHOT_TOO_LARGE"
  | "SNAPSHOT_UPLOAD_FAILED"
  | "SNAPSHOT_LINK_FAILED"
  | "SNAPSHOT_ACCESS_FAILED";

export class CloudApplicationError extends Error {
  readonly code: CloudErrorCode;

  constructor(code: CloudErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "CloudApplicationError";
    this.code = code;
    if (options?.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

export function cloudError(
  code: CloudErrorCode,
  message: string,
  cause?: unknown,
): CloudApplicationError {
  return new CloudApplicationError(code, message, { cause });
}
