package com.jaby.securemessenger

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.*

class ChatHeadModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "ChatHeadModule"

    @ReactMethod
    fun isOverlaySupported(promise: Promise) {
        promise.resolve(true)
    }

    @ReactMethod
    fun checkOverlayPermission(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                promise.resolve(Settings.canDrawOverlays(reactContext))
            } else {
                promise.resolve(true)
            }
        } catch (e: Exception) {
            promise.reject("ERR_CHECK_PERMISSION", e.message)
        }
    }

    @ReactMethod
    fun requestOverlayPermission(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                if (!Settings.canDrawOverlays(reactContext)) {
                    val intent = Intent(
                        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:" + reactContext.packageName)
                    ).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    reactContext.startActivity(intent)
                    promise.resolve(false)
                } else {
                    promise.resolve(true)
                }
            } else {
                promise.resolve(true)
            }
        } catch (e: Exception) {
            promise.reject("ERR_REQUEST_PERMISSION", e.message)
        }
    }

    @ReactMethod
    fun showChatHead(options: ReadableMap, promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(reactContext)) {
                promise.reject("ERR_NO_PERMISSION", "Overlay permission (SYSTEM_ALERT_WINDOW) not granted")
                return
            }

            val contactId = if (options.hasKey("contactId")) options.getString("contactId") else ""
            val contactName = if (options.hasKey("contactName")) options.getString("contactName") else "Chat"
            val avatarUrl = if (options.hasKey("avatarUrl")) options.getString("avatarUrl") else null
            val unreadCount = if (options.hasKey("unreadCount")) options.getInt("unreadCount") else 0
            val isOnline = if (options.hasKey("isOnline")) options.getBoolean("isOnline") else false

            val intent = Intent(reactContext, ChatHeadService::class.java).apply {
                action = ChatHeadService.ACTION_SHOW
                putExtra(ChatHeadService.EXTRA_CONTACT_ID, contactId)
                putExtra(ChatHeadService.EXTRA_CONTACT_NAME, contactName)
                putExtra(ChatHeadService.EXTRA_AVATAR_URL, avatarUrl)
                putExtra(ChatHeadService.EXTRA_UNREAD_COUNT, unreadCount)
                putExtra(ChatHeadService.EXTRA_IS_ONLINE, isOnline)
            }

            reactContext.startService(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_SHOW_CHAT_HEAD", e.message)
        }
    }

    @ReactMethod
    fun hideChatHead(promise: Promise) {
        try {
            val intent = Intent(reactContext, ChatHeadService::class.java).apply {
                action = ChatHeadService.ACTION_HIDE
            }
            reactContext.startService(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_HIDE_CHAT_HEAD", e.message)
        }
    }

    @ReactMethod
    fun getPendingChatIntent(promise: Promise) {
        try {
            val activity = currentActivity
            val intent = activity?.intent
            val chatId = intent?.getStringExtra("chatId")
            val contactName = intent?.getStringExtra("contactName")
            val fromChatHead = intent?.getBooleanExtra("fromChatHead", false) ?: false

            if (!chatId.isNullOrEmpty() && fromChatHead) {
                val map = Arguments.createMap().apply {
                    putString("chatId", chatId)
                    putString("contactName", contactName ?: "")
                }
                // Clear extra so it doesn't fire again on subsequent renders
                intent.removeExtra("chatId")
                intent.removeExtra("fromChatHead")
                promise.resolve(map)
            } else {
                promise.resolve(null)
            }
        } catch (e: Exception) {
            promise.reject("ERR_PENDING_INTENT", e.message)
        }
    }
}
