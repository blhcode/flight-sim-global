if (typeof globalThis.self === 'undefined') {
  globalThis.self = globalThis;
}

if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElement(type) {
      if (type === 'canvas') {
        return {
          width: 1,
          height: 1,
          getContext: () => ({
            drawImage: () => {},
            getImageData: () => ({ data: new Uint8ClampedArray(4) }),
          }),
          toDataURL: () => 'data:image/png;base64,',
        };
      }
      return {};
    },
    createElementNS(_ns, type) {
      return this.createElement(type);
    },
  };
}

if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReader {
    result = null;
    onload = null;
    readAsArrayBuffer(blob) {
      Promise.resolve(blob.arrayBuffer()).then((buf) => {
        this.result = buf;
        this.onload?.({ target: this });
      });
    }
    readAsDataURL(blob) {
      Promise.resolve(blob.arrayBuffer()).then((buf) => {
        const b64 = Buffer.from(buf).toString('base64');
        this.result = `data:application/octet-stream;base64,${b64}`;
        this.onload?.({ target: this });
      });
    }
  };
}

if (typeof globalThis.ProgressEvent === 'undefined') {
  globalThis.ProgressEvent = class ProgressEvent extends Event {
    constructor(type, init = {}) {
      super(type);
      this.lengthComputable = init.lengthComputable ?? false;
      this.loaded = init.loaded ?? 0;
      this.total = init.total ?? 0;
    }
  };
}
