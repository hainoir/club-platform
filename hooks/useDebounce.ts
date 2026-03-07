import { useState, useEffect } from 'react';

// 【系统学习：防抖 Hook (useDebounce)】
// 在 React 中，像搜索框这样的高频输入事件会触发大量的重新渲染和复杂的分页/过滤计算。
// 通过封装这个自定义 Hook，我们将瞬时变化的值延迟 N 毫秒后才进行真正的状态提交响应，
// 有效防范了快速键盘敲击带来的性能灾难。
export function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);

    useEffect(() => {
        // 每次输入时设置一个定时器
        const timer = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);

        // 如果用户在 delay 时间内再次输入，原有的 effect 会被清理掉（清除老的定时器）
        // 从而保证只有最后一次停顿超过 delay 才会触发 setDebouncedValue
        return () => {
            clearTimeout(timer);
        };
    }, [value, delay]); // 当 value 或 delay 改变时重新计算

    return debouncedValue;
}
