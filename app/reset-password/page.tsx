import ResetPasswordForm from "./ResetPasswordForm"

export default function ResetPasswordPage() {
    return (
        <div className="flex min-h-[80vh] flex-col items-center justify-center p-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="w-full max-w-md space-y-8">
                <div className="flex flex-col space-y-2 text-center">
                    <h1 className="text-2xl font-semibold tracking-tight">重置密码</h1>
                    <p className="text-sm text-muted-foreground">通过邮箱中的重置链接，设置你的新密码。</p>
                </div>
                <ResetPasswordForm />
            </div>
        </div>
    )
}
