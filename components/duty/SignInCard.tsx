import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin, ShieldCheck, Loader2, Clock } from 'lucide-react';

interface SignInCardProps {
    onSignIn: () => void;
    isSigningIn: boolean;
    hasSignedInToday?: boolean;
    isInDutyPeriod?: boolean;
    disabledReason?: 'not_in_period' | 'not_assigned' | null;
}

export function SignInCard({ onSignIn, isSigningIn, hasSignedInToday = false, isInDutyPeriod = true, disabledReason = null }: SignInCardProps) {
    const buttonDisabled = isSigningIn || !isInDutyPeriod;

    return (
        <Card className="shadow-md border-primary/20 bg-gradient-to-br from-card to-primary/5">
            <CardHeader>
                <CardTitle className="flex items-center text-lg">
                    <ShieldCheck className="w-5 h-5 mr-2 text-primary" />
                    值班考勤打卡
                </CardTitle>
                <CardDescription>
                    基于地理边界验证。请确保您已身处系统设定的 <strong>工作室 50 米</strong> 范围内。
                </CardDescription>
            </CardHeader>
            <CardContent>
                {hasSignedInToday ? (
                    <div className="rounded-lg bg-green-500/10 p-4 border border-green-500/20 text-center text-green-700 dark:text-green-400">
                        <p className="font-semibold mb-1">今日已签到</p>
                        <p className="text-xs">感谢您辛勤的付出！</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        <Button
                            className="w-full h-14 text-base font-semibold shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-95 group relative overflow-hidden"
                            onClick={onSignIn}
                            disabled={buttonDisabled}
                        >
                            {isSigningIn ? (
                                <>
                                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                    正在雷达探距与验证...
                                </>
                            ) : !isInDutyPeriod ? (
                                <>
                                    <Clock className="mr-2 w-5 h-5" />
                                    {disabledReason === 'not_assigned' ? '您未被安排在当前班次' : '当前不在班次时间内'}
                                </>
                            ) : (
                                <>
                                    <MapPin className="mr-2 w-5 h-5 transition-transform group-hover:-translate-y-1" />
                                    立即验证定位并签到
                                </>
                            )}

                            {/* 扫光动效背景 */}
                            {isInDutyPeriod && (
                                <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                            )}
                        </Button>
                        {!isInDutyPeriod && (
                            <p className="text-xs text-center text-muted-foreground">
                                {disabledReason === 'not_assigned' ? '当前班次中没有您的排班记录' : '仅在您的排班时段内可签到'}
                            </p>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

