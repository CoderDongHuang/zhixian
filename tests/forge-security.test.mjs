import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const forge = require("node-forge");
const keys = generateKeyPairSync("rsa", { modulusLength: 2048, publicExponent: 65537 });
const privateKey = forge.pki.privateKeyFromPem(keys.privateKey.export({ format: "pem", type: "pkcs1" }));
const publicKey = forge.pki.publicKeyFromPem(keys.publicKey.export({ format: "pem", type: "pkcs1" }));
const message = "zhixian signing regression";
const digest = () => forge.md.sha256.create().update(message);
const asn1 = forge.asn1;
const node = (type, constructed, value) => asn1.create(asn1.Class.UNIVERSAL, type, constructed, value);
function encodedDigest({ parameters = true, extra = [], outer = [] } = {}) {
  const algorithm = [node(asn1.Type.OID, false, asn1.oidToDer(forge.pki.oids.sha256).getBytes())];
  if (parameters) algorithm.push(node(asn1.Type.NULL, false, ""));
  algorithm.push(...extra);
  return asn1.toDer(node(asn1.Type.SEQUENCE, true, [
    node(asn1.Type.SEQUENCE, true, algorithm),
    node(asn1.Type.OCTETSTRING, false, digest().digest().getBytes()), ...outer,
  ])).getBytes();
}

for (const parameters of [true, false]) {
  test(`forge accepts standard DigestAlgorithm ${parameters ? "with" : "without"} NULL`, () => {
    const signature = privateKey.sign(encodedDigest({ parameters }), "NONE");
    assert.equal(publicKey.verify(digest().digest().getBytes(), signature), true);
  });
  for (const [label, extra] of [
    ["extra octet string", [node(asn1.Type.OCTETSTRING, false, "unconsumed")]],
    ["extra nested sequence", [node(asn1.Type.SEQUENCE, true, [])]],
    ["extra NULL", [node(asn1.Type.NULL, false, ""), node(asn1.Type.NULL, false, "")]],
  ]) test(`forge rejects ${label}, parameters=${parameters}`, () => {
    const signature = privateKey.sign(encodedDigest({ parameters, extra }), "NONE");
    assert.throws(() => publicKey.verify(digest().digest().getBytes(), signature), /valid RSASSA-PKCS1-v1_5 DigestInfo/);
  });
}

test("forge continues rejecting outer extra elements", () => {
  const signature = privateKey.sign(encodedDigest({ outer: [node(asn1.Type.NULL, false, "")] }), "NONE");
  assert.throws(() => publicKey.verify(digest().digest().getBytes(), signature), /valid RSASSA-PKCS1-v1_5 DigestInfo/);
});

for (const algorithm of ["sha1", "sha256", "sha384", "sha512"]) test(`forge legitimate ${algorithm} RSA signatures verify and tampering fails`, () => {
  const md = () => forge.md[algorithm].create().update(message);
  const signature = privateKey.sign(md());
  assert.equal(publicKey.verify(md().digest().getBytes(), signature), true);
  assert.equal(publicKey.verify(forge.md[algorithm].create().update("tampered").digest().getBytes(), signature), false);
});

test("forge RSA-PSS remains compatible", () => {
  const scheme = () => forge.pss.create({ md: forge.md.sha256.create(), mgf: forge.mgf.mgf1.create(forge.md.sha256.create()), saltLength: 32 });
  const signature = privateKey.sign(digest(), scheme());
  assert.equal(publicKey.verify(digest().digest().getBytes(), signature, scheme()), true);
});

test("forge upstream PR 1152 e=3 regression vector is rejected", () => {
  // Public test vector from ceba34402e329f0365134f23fe19898756527d65 (BSD-3-Clause).
  const modulus =
    "E932AC92252F585B3A80A4DD76A897C8B7652952FE788F6EC8DD640587A1EE56" +
    "47670A8AD4C2BE0F9FA6E49C605ADF77B5174230AF7BD50E5D6D6D6D28CCF0A8" +
    "86A514CC72E51D209CC772A52EF419F6A953F3135929588EBE9B351FCA61CED7" +
    "8F346FE00DBB6306E5C2A4C6DFC3779AF85AB417371CF34D8387B9B30AE46D7A" +
    "5FF5A655B8D8455F1B94AE736989D60A6F2FD5CADBFFBD504C5A756A2E6BB5CE" +
    "CC13BCA7503F6DF8B52ACE5C410997E98809DB4DC30D943DE4E812A47553DCE5" +
    "4844A78E36401D13F77DC650619FED88D8B3926E3D8E319C80C744779AC5D6AB" +
    "E252896950917476ECE5E8FC27D5F053D6018D91B502C4787558A002B9283DA7";
  const signature = forge.util.hexToBytes(
    "a4ae63dd5e7712b78f4870d0f51e294df5503d4f16c5d27ae33370981fb57f0de49f" +
    "50f3d6a04666774cd984cd13972db9bf8e12bd294ef0ddc916c7c86cbae63efd7b6b" +
    "97885e69760c208a40f1aecc76a90d7af5145177efce1bb55807a8d05c20b1596753" +
    "ba710642fc9acdde6c160232654662c77cc4466c8257a38edb49f894e8845d0fd987" +
    "b857ced88f4b62505a080bd87ef700d35d392a6e8f6fde34250c50b86fae606cb551" +
    "215e8f4813239b77651d5565ad453698c071d48c31e8e526fb4a37610f64b3e1fb8e" +
    "5be5898e408ad08197a0947794a530b54f84485377ce4a7488ed485ce4e5e105dd89" +
    "698a472f390c3b1b76bc16b73276c4d1c81d");
  const key = forge.pki.rsa.setPublicKey(new forge.jsbn.BigInteger(modulus, 16), new forge.jsbn.BigInteger("3"));
  assert.throws(() => key.verify(forge.md.sha256.create().update("hello world!").digest().getBytes(), signature), /valid RSASSA-PKCS1-v1_5 DigestInfo/);
});

test("forge certificate create/sign/verify and Expo certificate consumer remain compatible", () => {
  const certificate = forge.pki.createCertificate();
  certificate.publicKey = publicKey;
  certificate.serialNumber = "01";
  certificate.validity.notBefore = new Date("2026-01-01");
  certificate.validity.notAfter = new Date("2027-01-01");
  certificate.setSubject([{ name: "commonName", value: "local-test.invalid" }]);
  certificate.setIssuer(certificate.subject.attributes);
  certificate.sign(privateKey, forge.md.sha256.create());
  const parsed = forge.pki.certificateFromPem(forge.pki.certificateToPem(certificate));
  assert.equal(parsed.verify(parsed), true);
  const expo = require("@expo/code-signing-certificates");
  const now = Date.now();
  const codeCertificate = expo.generateSelfSignedCodeSigningCertificate({
    keyPair: { publicKey, privateKey }, validityNotBefore: new Date(now - 60000),
    validityNotAfter: new Date(now + 86400000), commonName: "local-test.invalid",
  });
  const roundtrip = expo.convertCertificatePEMToCertificate(expo.convertCertificateToCertificatePEM(codeCertificate));
  assert.doesNotThrow(() => expo.validateSelfSignedCertificate(roundtrip, { publicKey, privateKey }));
  const buffer = Buffer.from("local Expo update manifest");
  const signed = expo.signBufferRSASHA256AndVerify(privateKey, roundtrip, buffer);
  assert.equal(publicKey.verify(forge.md.sha256.create().update(buffer.toString()).digest().getBytes(), Buffer.from(signed, "base64").toString("binary")), true);
});
