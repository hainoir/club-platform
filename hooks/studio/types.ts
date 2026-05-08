export interface StudioMember {
    id: string;
    sessionId: string;
    name: string;
    type: 'duty' | 'study';
    period: number;
}
