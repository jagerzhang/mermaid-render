declare module 'cos-nodejs-sdk-v5' {
  namespace COS {
    interface COSOptions {
      SecretId: string;
      SecretKey: string;
      Domain?: string;
    }

    interface CosError {
      message: string;
      code?: string;
      statusCode?: number;
    }

    interface HeadObjectParams {
      Bucket: string;
      Region: string;
      Key: string;
    }

    interface PutObjectParams {
      Bucket: string;
      Region: string;
      Key: string;
      Body: Buffer | string;
      ContentType?: string;
      ACL?: 'private' | 'public-read' | 'public-read-write';
    }

    interface PutObjectResult {
      Location: string;
      ETag: string;
    }

    interface HeadObjectResult {
      ETag: string;
      ContentLength: string;
    }
  }

  class COS {
    constructor(options: COS.COSOptions);
    
    putObject(
      params: COS.PutObjectParams,
      callback: (err: COS.CosError | null, result?: COS.PutObjectResult) => void
    ): void;
    
    headObject(
      params: COS.HeadObjectParams,
      callback: (err: COS.CosError | null, result?: COS.HeadObjectResult) => void
    ): void;
  }

  export = COS;
}
