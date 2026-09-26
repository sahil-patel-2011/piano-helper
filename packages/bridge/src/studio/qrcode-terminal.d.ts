declare module "qrcode-terminal" {
  const qrcode: {
    generate(text: string, opts: { small?: boolean }, cb?: (code: string) => void): void;
  };
  export default qrcode;
}
