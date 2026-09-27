// Touch ID for private notes (PRIV-REC-004), compiled into NODI by build.rs.
//
// A copy of the private-notes key is sealed to a Secure Enclave key that only
// works on this Mac, and only after Touch ID or the Mac's password. Sealing
// uses the Secure Enclave key's public half, so it needs no authentication;
// opening needs the private half, which is when macOS asks.
//
// Sealed format (base64): version byte 1, then the Secure Enclave key's
// 2-byte big-endian length and data representation, the 65-byte ephemeral
// public key (X9.63), and the AES-GCM combined box.

import CryptoKit
import Foundation
import LocalAuthentication

private let version: UInt8 = 1
private let info = Data("NODI Touch ID v1".utf8)

private enum KeyguardError: Error {
  case invalid(String)
}

private func symmetricKey(_ secret: SharedSecret, _ ephemeral: Data) -> SymmetricKey {
  secret.hkdfDerivedSymmetricKey(
    using: SHA256.self, salt: ephemeral, sharedInfo: info, outputByteCount: 32)
}

private func seal(_ plaintext: Data) throws -> String {
  guard SecureEnclave.isAvailable else {
    throw KeyguardError.invalid("This Mac has no Secure Enclave.")
  }
  var error: Unmanaged<CFError>?
  guard
    let access = SecAccessControlCreateWithFlags(
      nil, kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
      [.privateKeyUsage, .userPresence], &error)
  else {
    throw KeyguardError.invalid("Touch ID protection could not be created.")
  }
  let enclaveKey = try SecureEnclave.P256.KeyAgreement.PrivateKey(accessControl: access)
  let ephemeral = P256.KeyAgreement.PrivateKey()
  let shared = try ephemeral.sharedSecretFromKeyAgreement(with: enclaveKey.publicKey)
  let ephemeralPublic = ephemeral.publicKey.x963Representation
  let box = try AES.GCM.seal(plaintext, using: symmetricKey(shared, ephemeralPublic))
  guard let combined = box.combined else {
    throw KeyguardError.invalid("The key could not be sealed.")
  }
  let blob = enclaveKey.dataRepresentation
  var out = Data([version, UInt8(blob.count >> 8), UInt8(blob.count & 0xff)])
  out.append(blob)
  out.append(ephemeralPublic)
  out.append(combined)
  return out.base64EncodedString()
}

private func unseal(_ sealed: String, reason: String) throws -> Data {
  guard let data = Data(base64Encoded: sealed), data.count > 3, data[0] == version else {
    throw KeyguardError.invalid("The Touch ID data is not readable.")
  }
  let blobLength = Int(data[1]) << 8 | Int(data[2])
  let blobEnd = 3 + blobLength
  let publicEnd = blobEnd + 65
  guard data.count > publicEnd else {
    throw KeyguardError.invalid("The Touch ID data is not readable.")
  }
  let context = LAContext()
  context.localizedReason = reason
  let enclaveKey = try SecureEnclave.P256.KeyAgreement.PrivateKey(
    dataRepresentation: data.subdata(in: 3..<blobEnd), authenticationContext: context)
  let ephemeralPublic = data.subdata(in: blobEnd..<publicEnd)
  let shared = try enclaveKey.sharedSecretFromKeyAgreement(
    with: P256.KeyAgreement.PublicKey(x963Representation: ephemeralPublic))
  let box = try AES.GCM.SealedBox(combined: data.subdata(in: publicEnd..<data.count))
  return try AES.GCM.open(box, using: symmetricKey(shared, ephemeralPublic))
}

private func isCancel(_ error: Error) -> Bool {
  var current: NSError? = error as NSError
  while let error = current {
    if error.domain == LAError.errorDomain,
      [LAError.userCancel.rawValue, LAError.systemCancel.rawValue, LAError.appCancel.rawValue]
        .contains(error.code)
    {
      return true
    }
    if error.domain == NSOSStatusErrorDomain, error.code == Int(errSecUserCanceled) {
      return true
    }
    current = error.userInfo[NSUnderlyingErrorKey] as? NSError
  }
  return false
}

private func message(_ error: Error) -> String {
  if case KeyguardError.invalid(let text) = error { return text }
  return (error as NSError).localizedDescription
}

private func output(_ text: String, _ out: UnsafeMutablePointer<UnsafeMutablePointer<CChar>?>)
{
  out.pointee = strdup(text)
}

/// Whether Touch ID or the Mac's password can protect a key on this Mac.
@_cdecl("nodi_keyguard_available")
public func nodiKeyguardAvailable() -> Bool {
  var error: NSError?
  return SecureEnclave.isAvailable
    && LAContext().canEvaluatePolicy(.deviceOwnerAuthentication, error: &error)
}

/// Whether the Mac has Touch ID enrolled (otherwise macOS asks for the password).
@_cdecl("nodi_keyguard_has_biometrics")
public func nodiKeyguardHasBiometrics() -> Bool {
  var error: NSError?
  return LAContext().canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
}

/// Seals base64 `secret`. Returns 0 with the sealed text in `out`, or 1 with
/// an error message.
@_cdecl("nodi_keyguard_seal")
public func nodiKeyguardSeal(
  _ secret: UnsafePointer<CChar>, _ out: UnsafeMutablePointer<UnsafeMutablePointer<CChar>?>
) -> Int32 {
  guard let plaintext = Data(base64Encoded: String(cString: secret)) else {
    output("The key is not valid base64.", out)
    return 1
  }
  do {
    output(try seal(plaintext), out)
    return 0
  } catch {
    output(message(error), out)
    return 1
  }
}

/// Opens `sealed` after Touch ID or the Mac's password, showing `reason`.
/// Returns 0 with the base64 secret in `out`, 1 with an error message, or 2
/// when the user cancelled.
@_cdecl("nodi_keyguard_unseal")
public func nodiKeyguardUnseal(
  _ sealed: UnsafePointer<CChar>, _ reason: UnsafePointer<CChar>,
  _ out: UnsafeMutablePointer<UnsafeMutablePointer<CChar>?>
) -> Int32 {
  do {
    let secret = try unseal(String(cString: sealed), reason: String(cString: reason))
    output(secret.base64EncodedString(), out)
    return 0
  } catch {
    output(message(error), out)
    return isCancel(error) ? 2 : 1
  }
}

@_cdecl("nodi_keyguard_free")
public func nodiKeyguardFree(_ text: UnsafeMutablePointer<CChar>?) {
  free(text)
}
