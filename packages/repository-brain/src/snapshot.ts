import { walkRepository } from "./walker.js";
import type { RepositorySnapshot } from "./types.js";

export async function createSnapshot(
  root: string
): Promise<RepositorySnapshot> {
  const files = await walkRepository(root);

  return {
    root,
    files,
  };
}