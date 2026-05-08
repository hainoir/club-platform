export function getDutyActionErrorMessage(error: unknown): string {
    return (error as { message?: string })?.message || '操作失败，请稍后重试。';
}
