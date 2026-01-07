export type Response = {
  token: string;
  tests?: {
    entryUrl: string;
    variants: string[];
  }[];
};
