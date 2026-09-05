package com.jaby.securemessenger

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.*

class NotificationModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val CHANNEL_MESSAGES = "jaby_channel_messages"
        const val CHANNEL_CALLS = "jaby_channel_calls"
        const val CHANNEL_SECURITY = "jaby_channel_security"

        const val EXTRA_NOTIFICATION_TYPE = "notification_type"
        const val EXTRA_CHAT_ID = "notification_chat_id"
        const val EXTRA_PEER_ID = "notification_peer_id"
    }

    private val notificationManager: NotificationManager by lazy {
        reactContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    }

    init {
        createChannels()
    }

    override fun getName(): String = "NotificationModule"

    private fun createChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // 1. Messages Channel
            val messagesChannel = NotificationChannel(
                CHANNEL_MESSAGES,
                "Encrypted Messages",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Incoming end-to-end encrypted message notifications"
                enableLights(true)
                lightColor = Color.parseColor("#10b981")
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 200, 100, 200)
                setShowBadge(true)
                lockscreenVisibility = Notification.VISIBILITY_PRIVATE
            }

            // 2. Incoming Calls Channel
            val callsChannel = NotificationChannel(
                CHANNEL_CALLS,
                "Incoming Secure Calls",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Incoming encrypted voice and video call alerts"
                enableLights(true)
                lightColor = Color.parseColor("#38bdf8")
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 1000, 500, 1000, 500, 1000)
                val defaultRingtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
                setSound(
                    defaultRingtoneUri,
                    AudioAttributes.Builder()
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .build()
                )
                setShowBadge(true)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            }

            // 3. Security Alerts Channel
            val securityChannel = NotificationChannel(
                CHANNEL_SECURITY,
                "Security & Privacy Alerts",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Key changes, session zeroizations, and safety alerts"
                enableLights(true)
                lightColor = Color.parseColor("#f59e0b")
                enableVibration(true)
                setShowBadge(true)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            }

            notificationManager.createNotificationChannel(messagesChannel)
            notificationManager.createNotificationChannel(callsChannel)
            notificationManager.createNotificationChannel(securityChannel)
        }
    }

    @ReactMethod
    fun areNotificationsEnabled(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                val permission = ContextCompat.checkSelfPermission(
                    reactContext,
                    android.Manifest.permission.POST_NOTIFICATIONS
                )
                promise.resolve(permission == PackageManager.PERMISSION_GRANTED && notificationManager.areNotificationsEnabled())
            } else {
                promise.resolve(notificationManager.areNotificationsEnabled())
            }
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun postNotification(options: ReadableMap, promise: Promise) {
        try {
            val id = if (options.hasKey("id")) options.getInt("id") else (System.currentTimeMillis() % 100000).toInt()
            val channelType = if (options.hasKey("channel")) options.getString("channel") else "messages"
            val title = if (options.hasKey("title")) options.getString("title") else "JABY Secure Messenger"
            val body = if (options.hasKey("body")) options.getString("body") else ""
            val chatId = if (options.hasKey("chatId")) options.getString("chatId") else null
            val peerId = if (options.hasKey("peerId")) options.getString("peerId") else null
            val isCall = if (options.hasKey("isCall")) options.getBoolean("isCall") else false
            val isSecurity = if (options.hasKey("isSecurity")) options.getBoolean("isSecurity") else false

            val channelId = when (channelType) {
                "calls" -> CHANNEL_CALLS
                "security" -> CHANNEL_SECURITY
                else -> CHANNEL_MESSAGES
            }

            // Click Intent
            val launchIntent = reactContext.packageManager.getLaunchIntentForPackage(reactContext.packageName)?.apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra(EXTRA_NOTIFICATION_TYPE, channelType)
                if (chatId != null) putExtra(EXTRA_CHAT_ID, chatId)
                if (peerId != null) putExtra(EXTRA_PEER_ID, peerId)
            }

            val pendingIntentFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            } else {
                PendingIntent.FLAG_UPDATE_CURRENT
            }

            val pendingIntent = launchIntent?.let {
                PendingIntent.getActivity(reactContext, id, it, pendingIntentFlags)
            }

            val appIconRes = reactContext.applicationInfo.icon

            val builder = NotificationCompat.Builder(reactContext, channelId)
                .setSmallIcon(if (appIconRes != 0) appIconRes else android.R.drawable.ic_dialog_info)
                .setContentTitle(title)
                .setContentText(body)
                .setAutoCancel(!isCall)
                .setPriority(if (isCall) NotificationCompat.PRIORITY_MAX else NotificationCompat.PRIORITY_HIGH)
                .setContentIntent(pendingIntent)

            if (isCall) {
                builder.setCategory(NotificationCompat.CATEGORY_CALL)
                builder.setOngoing(true)
            } else if (isSecurity) {
                builder.setCategory(NotificationCompat.CATEGORY_STATUS)
            } else {
                builder.setCategory(NotificationCompat.CATEGORY_MESSAGE)
            }

            notificationManager.notify(id, builder.build())
            promise.resolve(id)
        } catch (e: Exception) {
            promise.reject("NOTIFICATION_ERROR", e.message)
        }
    }

    @ReactMethod
    fun cancelNotification(id: Int, promise: Promise) {
        try {
            notificationManager.cancel(id)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("CANCEL_ERROR", e.message)
        }
    }

    @ReactMethod
    fun cancelAllNotifications(promise: Promise) {
        try {
            notificationManager.cancelAll()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("CANCEL_ALL_ERROR", e.message)
        }
    }
}
