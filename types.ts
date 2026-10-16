export type Stop = { id: string; name: string; lat: number; lng: number; note: string; photos: string[] };
export type Trip = { id: string; owner: string; title: string; createdAt: number; stops: Stop[] };
