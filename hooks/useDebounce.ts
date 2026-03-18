import { useState, useEffect } from 'react';

// 【系统学习：防抖函数封装】
// 在界面中，像搜索框这样的高频输入会触发大量重渲染和复杂的分页或过滤计算。
// 通过封装这个自定义函数，我们将瞬时变化的值延迟若干毫秒后再提交状态，
// 有效防范了快速键盘敲击带来的性能灾难。
export function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);

    useEffect(() => {
        // 每次输入时设置一个定时器
        const timer = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);

        // 如果用户在设定延迟内再次输入，原有副作用会被清理（清除旧定时器）
        // 从而保证只有最后一次停顿超过延迟时间才会触发状态更新
        return () => {
            clearTimeout(timer);
        };
    }, [value, delay]); // 当输入值或延迟时间变化时重新计算

    return debouncedValue;
}
