export type StrokeEventType = "begin" | "draw" | "end";

export type SignatureStroke = {
  type: StrokeEventType;
  x: number;
  y: number;
  color: string;
  width: number;
};

export type SignatureCommit = {
  imageBase64: string;
  width: number;
  height: number;
  createdAt: number;
};

export type SignatureBackground =
  | {
      kind: "color";
      value: string;
    }
  | {
      kind: "image";
      value: string;
    };

export const DEFAULT_SIGNATURE_BACKGROUND: SignatureBackground = {
  kind: "color",
  value: "#ffffff"
};
