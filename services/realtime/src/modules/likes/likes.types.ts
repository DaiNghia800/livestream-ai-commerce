export interface LikesResult {
  livestreamId: string;
  likesCount: number;
  timestamp: number;
}

export interface ILikesRepository {
  isAvailable(): boolean;
  incrementLikes(livestreamId: string, count: number): Promise<LikesResult>;
  getLikes(livestreamId: string): Promise<LikesResult>;
  disconnect(): Promise<void>;
}

