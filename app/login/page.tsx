import LoginForm from "./LoginForm"

export default function LoginPage() {
    return (
        <div className="flex min-h-[80vh] flex-col items-center justify-center p-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="w-full max-w-md space-y-8">
                <div className="flex flex-col space-y-2 text-center">
                    <h1 className="text-2xl font-semibold tracking-tight">前端开发社团平台</h1>
                    <p className="text-sm text-muted-foreground">请输入您的账户以继续访问后台管理系统</p>
                </div>
                <LoginForm />
            </div>
        </div>
    )
}
