import type { ArtifactReference, PlatformDatabase } from './types';

export interface PlatformStore {
  initialize(): Promise<void>;
  read(): Promise<PlatformDatabase>;
  transaction<T>(mutator: (database: PlatformDatabase) => T | Promise<T>): Promise<T>;
  writeArtifact(kind: 'inputs' | 'outputs' | 'evidence', value: unknown): Promise<ArtifactReference>;
  readArtifact<T>(relativePath: string): Promise<T>;
  deleteOutputArtifactIfUnreferenced(relativePath:string):Promise<boolean>;
}
