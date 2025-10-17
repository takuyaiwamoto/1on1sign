export function cn(...inputs: Array<string | undefined | false | null>) {
  return inputs.filter(Boolean).join(" ");
}

export function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
