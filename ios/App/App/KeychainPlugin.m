#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(KeychainPlugin, "KeychainPlugin",
           CAP_PLUGIN_METHOD(setSecret, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(getSecret, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(deleteSecret, CAPPluginReturnPromise);
)
