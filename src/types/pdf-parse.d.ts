declare module "pdf-parse/lib/pdf-parse.js" {
  interface PDFInfo {
    numpages: number;
    numrender: number;
    info: any;
    metadata: any;
    version: string;
    text: string;
  }

  function parse(dataBuffer: Uint8Array | Buffer): Promise<PDFInfo>;
  export default parse;
}
