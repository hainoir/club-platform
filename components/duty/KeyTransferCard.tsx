'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Key, ArrowRight, Check, Send, ChevronDown, Search } from 'lucide-react';
import { useDuty } from '@/hooks/useDuty';
import { useUserStore } from '@/store/useUserStore';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { SimpleMember } from '@/components/duty/DutyTable';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';

interface KeyTransferCardProps {
    dutyManager: ReturnType<typeof useDuty>;
    allMembers: SimpleMember[];
}

export function KeyTransferCard({ dutyManager, allMembers }: KeyTransferCardProps) {
    const { user } = useUserStore();
    const { keyTransfers, refreshKeyTransfers, submitKeyTransfer, confirmKeyTransfer } = dutyManager;

    const [note, setNote] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // 初始化加载
    useEffect(() => {
        refreshKeyTransfers();
    }, [refreshKeyTransfers]);

    // 发起交接
    const handleTransfer = async (toMemberId: string) => {
        setIsSubmitting(true);
        const success = await submitKeyTransfer(toMemberId, note);
        setIsSubmitting(false);
        if (success) {
            setNote('');
        }
    };

    // 待我确认的交接
    const pendingForMe = keyTransfers.filter(
        t => t.to_member_id === user?.id && t.status === 'pending'
    );

    return (
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h3 className="font-semibold text-lg border-b border-border pb-3 mb-4 flex items-center">
                <Key className="w-5 h-5 mr-2 text-amber-500" />
                钥匙交接
            </h3>

            {/* 待我确认的交接 */}
            {pendingForMe.length > 0 && (
                <div className="space-y-2 mb-4">
                    {pendingForMe.map(t => (
                        <div key={t.id} className="flex items-center justify-between p-2.5 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 text-sm">
                            <div className="flex flex-col">
                                <span className="font-medium">{t.from_member?.name} 交给你</span>
                                {t.note && <span className="text-xs text-muted-foreground mt-0.5">{t.note}</span>}
                            </div>
                            <Button
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => confirmKeyTransfer(t.id)}
                            >
                                <Check className="w-3 h-3 mr-1" />
                                确认接收
                            </Button>
                        </div>
                    ))}
                </div>
            )}

            {/* 发起交接 */}
            <div className="space-y-2">
                <Input
                    placeholder="备注（可选）"
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    className="text-sm h-9"
                />
                <MemberSelectButton
                    allMembers={allMembers.filter(m => m.id !== user?.id)}
                    onSelect={handleTransfer}
                    isSubmitting={isSubmitting}
                />
            </div>

            {/* 最近记录 */}
            {keyTransfers.length > 0 && (
                <div className="mt-4 pt-3 border-t border-border">
                    <p className="text-xs text-muted-foreground mb-2">最近交接记录</p>
                    <div className="space-y-1.5">
                        {keyTransfers.slice(0, 5).map(t => (
                            <div key={t.id} className="flex items-center text-xs text-muted-foreground">
                                <span>{t.from_member?.name || '?'}</span>
                                <ArrowRight className="w-3 h-3 mx-1 shrink-0" />
                                <span>{t.to_member?.name}</span>
                                <Badge variant="outline" className="ml-auto text-[10px] h-5">
                                    {t.status === 'confirmed' ? '已完成' : '待确认'}
                                </Badge>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// 成员选择按钮（复用 Popover 模式）
function MemberSelectButton({
    allMembers,
    onSelect,
    isSubmitting,
}: {
    allMembers: SimpleMember[];
    onSelect: (memberId: string) => void;
    isSubmitting: boolean;
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');

    const filtered = allMembers.filter(
        m => m.name.toLowerCase().includes(search.toLowerCase()) ||
            (m.student_id && m.student_id.includes(search))
    );

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    className="w-full justify-start text-muted-foreground text-sm h-9"
                    disabled={isSubmitting}
                >
                    <Send className="w-3 h-3 mr-2" />
                    我要交接钥匙...
                    <ChevronDown className="w-3 h-3 ml-auto" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" align="start">
                <div className="relative mb-2">
                    <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                        placeholder="选择接收人..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="h-8 pl-7 text-xs"
                    />
                </div>
                <div className="max-h-48 overflow-y-auto space-y-0.5">
                    {filtered.length === 0 ? (
                        <p className="text-xs text-center text-muted-foreground py-3">未找到</p>
                    ) : (
                        filtered.map(member => (
                            <button
                                key={member.id}
                                onClick={() => {
                                    onSelect(member.id);
                                    setOpen(false);
                                    setSearch('');
                                }}
                                className="w-full text-left px-2 py-1.5 rounded-md text-xs hover:bg-accent transition-colors"
                            >
                                {member.name}
                            </button>
                        ))
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}
