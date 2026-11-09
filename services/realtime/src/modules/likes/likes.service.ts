import { ILikesRepository, LikesResult } from "./likes.types.js";

export class LikesService {
  constructor(private readonly repository: ILikesRepository) {}

  async incrementLikes(livestreamId: string, count: number): Promise<LikesResult> {
    const validCount = Math.max(1, Math.min(100, Math.floor(count)));
    return this.repository.incrementLikes(livestreamId, validCount);
  }

  async getLikes(livestreamId: string): Promise<LikesResult> {
    return this.repository.getLikes(livestreamId);
  }
}

