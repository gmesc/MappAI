import Foundation
import Capacitor

@objc(KeychainPlugin)
public class KeychainPlugin: CAPPlugin {
    
    @objc func setSecret(_ call: CAPPluginCall) {
        guard let key = call.getString("key") else {
            call.reject("Key is missing")
            return
        }
        guard let value = call.getString("value") else {
            call.reject("Value is missing")
            return
        }
        
        let data = value.data(using: .utf8)!
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock
        ]
        
        // Delete any existing item first
        let deleteQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key
        ]
        SecItemDelete(deleteQuery as CFDictionary)
        
        // Add new item
        let status = SecItemAdd(query as CFDictionary, nil)
        
        if status == errSecSuccess {
            call.resolve([
                "success": true
            ])
        } else {
            call.reject("Failed to save to keychain with status: \(status)")
        }
    }
    
    @objc func getSecret(_ call: CAPPluginCall) {
        guard let key = call.getString("key") else {
            call.reject("Key is missing")
            return
        }
        
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecReturnData as String: kCFBooleanTrue!,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        
        var dataTypeRef: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &dataTypeRef)
        
        if status == errSecSuccess {
            if let data = dataTypeRef as? Data, let value = String(data: data, encoding: .utf8) {
                call.resolve([
                    "value": value
                ])
            } else {
                call.reject("Failed to decode keychain value")
            }
        } else if status == errSecItemNotFound {
            call.resolve([
                "value": ""
            ])
        } else {
            call.reject("Failed to read from keychain with status: \(status)")
        }
    }
    
    @objc func deleteSecret(_ call: CAPPluginCall) {
        guard let key = call.getString("key") else {
            call.reject("Key is missing")
            return
        }
        
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key
        ]
        
        let status = SecItemDelete(query as CFDictionary)
        
        if status == errSecSuccess || status == errSecItemNotFound {
            call.resolve([
                "success": true
            ])
        } else {
            call.reject("Failed to delete from keychain with status: \(status)")
        }
    }
}
