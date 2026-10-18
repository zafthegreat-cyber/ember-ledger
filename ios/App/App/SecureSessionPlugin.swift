import Foundation
import Security
import Capacitor

@objc(SecureSessionPlugin)
public class SecureSessionPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SecureSessionPlugin"
    public let jsName = "SecureSession"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise)
    ]
    private func query(_ call: CAPPluginCall) -> [String: Any]? {
        guard let key = call.getString("key"), key.range(of: "^[a-zA-Z0-9_.:-]{1,250}$", options: .regularExpression) != nil else {
            call.reject("Invalid sign-in storage key."); return nil
        }
        return [kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: "app.code3tcg.mobile.session",
                kSecAttrAccount as String: key]
    }
    @objc func get(_ call: CAPPluginCall) {
        guard var values = query(call) else { return }
        values[kSecReturnData as String] = true
        values[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(values as CFDictionary, &item)
        if status == errSecItemNotFound { call.resolve(); return }
        guard status == errSecSuccess, let data = item as? Data,
              let value = String(data: data, encoding: .utf8) else {
            call.reject("Secure sign-in storage could not be read."); return
        }
        call.resolve(["value": value])
    }
    @objc func set(_ call: CAPPluginCall) {
        guard var values = query(call), let value = call.getString("value"),
              value.utf8.count <= 131072, let data = value.data(using: .utf8) else {
            call.reject("Secure sign-in storage could not be saved."); return
        }
        let updates = [kSecValueData as String: data]
        var status = SecItemUpdate(values as CFDictionary, updates as CFDictionary)
        if status == errSecItemNotFound {
            values[kSecValueData as String] = data
            values[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            status = SecItemAdd(values as CFDictionary, nil)
        }
        guard status == errSecSuccess else { call.reject("Secure sign-in storage could not be saved."); return }
        call.resolve()
    }
    @objc func remove(_ call: CAPPluginCall) {
        guard let values = query(call) else { return }
        let status = SecItemDelete(values as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { call.reject("Secure sign-in storage could not be cleared."); return }
        call.resolve()
    }
}

@objc(Code3BridgeViewController)
class Code3BridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(SecureSessionPlugin())
    }
}
