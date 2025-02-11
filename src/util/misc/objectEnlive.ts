import { fabric } from '../../../HEADER';
import { capitalize, camelize } from '../lang_string';
import { noop } from '../../constants';

/**
 * Returns klass "Class" object of given namespace
 * @memberOf fabric.util
 * @param {String} type Type of object (eg. 'circle')
 * @param {object} namespace Namespace to get klass "Class" object from
 * @return {Object} klass "Class"
 */
export const getKlass = (type: string, namespace = fabric): any => namespace[capitalize(camelize(type), true)];

type LoadImageOptions = {
  signal?: AbortSignal;
  crossOrigin?: 'anonymous' | 'use-credentials' | null;
}

/**
 * Loads image element from given url and resolve it, or catch.
 * @memberOf fabric.util
 * @param {String} url URL representing an image
 * @param {Object} [options] image loading options
 * @param {string} [options.crossOrigin] cors value for the image loading, default to anonymous
 * @param {AbortSignal} [options.signal] handle aborting, see https://developer.mozilla.org/en-US/docs/Web/API/AbortController/signal
 * @param {Promise<fabric.Image>} img the loaded image.
 */
export const loadImage = (url: string, { signal, crossOrigin = null }: LoadImageOptions = {}) =>
  new Promise(function (resolve, reject) {
    if (signal && signal.aborted) {
      return reject(new Error('`options.signal` is in `aborted` state'));
    }
    const img = fabric.util.createImage();
    let abort: EventListenerOrEventListenerObject;
    if (signal) {
      abort = function (err: Event) {
        img.src = '';
        reject(err);
      };
      signal.addEventListener('abort', abort, { once: true });
    }
    const done = function() {
      img.onload = img.onerror = null;
      abort && signal?.removeEventListener('abort', abort);
      resolve(img);
    };
    if (!url) {
      done();
      return;
    }
    img.onload = done;
    img.onerror = function () {
      abort && signal?.removeEventListener('abort', abort);
      reject(new Error('Error loading ' + img.src));
    };
    crossOrigin && (img.crossOrigin = crossOrigin);
    img.src = url;
  });


type EnlivenObjectOptions = {
  signal?: AbortSignal;
  reviver?: (arg: any, arg2: any) => void;
  namespace?: any;
}

/**
 * Creates corresponding fabric instances from their object representations
 * @static
 * @memberOf fabric.util
 * @param {Object[]} objects Objects to enliven
 * @param {object} [options]
 * @param {object} [options.namespace] Namespace to get klass "Class" object from
 * @param {(serializedObj: object, instance: fabric.Object) => any} [options.reviver] Method for further parsing of object elements,
 * called after each fabric object created.
 * @param {AbortSignal} [options.signal] handle aborting, see https://developer.mozilla.org/en-US/docs/Web/API/AbortController/signal
 * @returns {Promise<fabric.Object[]>}
 */
export const enlivenObjects = (
  objects: any[],
  {
    signal,
    reviver = noop,
    namespace = fabric,
  }: EnlivenObjectOptions = {},
) => new Promise((resolve, reject) => {
  const instances: any[] = [];
  signal && signal.addEventListener('abort', reject, { once: true });
  Promise.all(objects.map((obj) =>
    getKlass(obj.type, namespace).fromObject(obj, {
      signal,
      reviver,
      namespace,
    }).then((fabricInstance: any) => {
      reviver(obj, fabricInstance);
      instances.push(fabricInstance);
      return fabricInstance;
    })
  ))
  .then(resolve)
  .catch((error) => {
    // cleanup
    instances.forEach(function (instance) {
      instance.dispose && instance.dispose();
    });
    reject(error);
  })
  .finally(() => {
    signal && signal.removeEventListener('abort', reject);
  });
});

/**
 * Creates corresponding fabric instances residing in an object, e.g. `clipPath`
 * @static
 * @memberOf fabric.util
 * @param {Object} object with properties to enlive ( fill, stroke, clipPath, path )
 * @param {object} [options]
 * @param {AbortSignal} [options.signal] handle aborting, see https://developer.mozilla.org/en-US/docs/Web/API/AbortController/signal
 * @returns {Promise<{[key:string]:fabric.Object|fabric.Pattern|fabric.Gradient|null}>} the input object with enlived values
 */
export const enlivenObjectEnlivables = (serializedObject: any, { signal }: { signal?: AbortSignal } = {}) =>
  new Promise((resolve, reject) => {
    const instances: any[] = [];
    signal && signal.addEventListener('abort', reject, { once: true });
    // enlive every possible property
    const promises = Object.values(serializedObject).map((value: any) => {
      if (!value) {
        return value;
      }
      // gradient
      if (value.colorStops) {
        return new fabric.Gradient(value);
      }
      // clipPath
      if (value.type) {
        return fabric.util.enlivenObjects([value], { signal }).then(([enlived]: any[]) => {
          instances.push(enlived);
          return enlived;
        });
      }
      // pattern
      if (value.source) {
        return fabric.Pattern.fromObject(value, { signal }).then((pattern: any) => {
          instances.push(pattern);
          return pattern;
        });
      }
      return value;
    });
    const keys = Object.keys(serializedObject);
    Promise.all(promises).then((enlived) => {
      return enlived.reduce(function (acc, instance, index) {
        acc[keys[index]] = instance;
        return acc;
      }, {});
    })
    .then(resolve)
    .catch(function (error) {
      // cleanup
      instances.forEach((instance) => {
        instance.dispose && instance.dispose();
      });
      reject(error);
    })
    .finally(function () {
      signal && signal.removeEventListener('abort', reject);
    });
  });
