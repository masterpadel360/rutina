// Genera las claves VAPID para el worker de avisos (sin npm). Uso: node tools/generar-vapid.mjs
// Pegá VAPID_PUBLIC como variable de texto y VAPID_PRIVATE como SECRETO. No las guardes en el repo.
const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
console.log('VAPID_PUBLIC=' + b64u(pub));
console.log('VAPID_PRIVATE=' + jwk.d);
