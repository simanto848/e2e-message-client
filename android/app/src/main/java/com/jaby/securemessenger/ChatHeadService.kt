package com.jaby.securemessenger

import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.*
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.util.DisplayMetrics
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.view.animation.DecelerateInterpolator
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.TextView
import java.net.URL
import kotlin.concurrent.thread

class ChatHeadService : Service() {

    private var windowManager: WindowManager? = null
    private var chatHeadView: FrameLayout? = null
    private var dismissTargetView: FrameLayout? = null
    private var layoutParams: WindowManager.LayoutParams? = null
    private var dismissParams: WindowManager.LayoutParams? = null

    private var contactId: String = ""
    private var contactName: String = "Chat"
    private var unreadCount: Int = 0
    private var isOnline: Boolean = false

    private var screenWidth: Int = 1080
    private var screenHeight: Int = 1920

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        updateScreenDimensions()
        createNotificationChannelIfNeeded()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent == null) return START_NOT_STICKY

        val action = intent.action
        if (action == ACTION_HIDE) {
            removeChatHead()
            stopSelf()
            return START_NOT_STICKY
        }

        contactId = intent.getStringExtra(EXTRA_CONTACT_ID) ?: ""
        contactName = intent.getStringExtra(EXTRA_CONTACT_NAME) ?: "Chat"
        unreadCount = intent.getIntExtra(EXTRA_UNREAD_COUNT, 0)
        isOnline = intent.getBooleanExtra(EXTRA_IS_ONLINE, false)
        val avatarUrl = intent.getStringExtra(EXTRA_AVATAR_URL)

        if (!Settings.canDrawOverlays(this)) {
            stopSelf()
            return START_NOT_STICKY
        }

        if (chatHeadView == null) {
            setupChatHead(avatarUrl)
        } else {
            updateChatHeadContent(avatarUrl)
        }

        return START_STICKY
    }

    private fun updateScreenDimensions() {
        val dm = DisplayMetrics()
        windowManager?.defaultDisplay?.getMetrics(dm)
        screenWidth = dm.widthPixels
        screenHeight = dm.heightPixels
    }

    private fun dpToPx(dp: Float): Int {
        return TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            dp,
            resources.displayMetrics
        ).toInt()
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun setupChatHead(avatarUrl: String?) {
        updateScreenDimensions()

        val headSize = dpToPx(62f)

        val layoutType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }

        layoutParams = WindowManager.LayoutParams(
            headSize,
            headSize,
            layoutType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = screenWidth - headSize - dpToPx(16f)
            y = dpToPx(160f)
        }

        chatHeadView = FrameLayout(this).apply {
            clipChildren = false
            clipToPadding = false
        }

        setupDismissTarget()

        val root = chatHeadView ?: return

        // 1. Avatar Container (Circular)
        val avatarContainer = FrameLayout(this).apply {
            id = View.generateViewId()
            val bg = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#0F172A")) // Slate 900
                setStroke(dpToPx(2.5f), Color.parseColor("#10B981")) // Emerald border
            }
            background = bg
            elevation = dpToPx(8f).toFloat()
        }
        val avatarLp = FrameLayout.LayoutParams(dpToPx(56f), dpToPx(56f)).apply {
            gravity = Gravity.CENTER
        }
        root.addView(avatarContainer, avatarLp)

        // 2. Initials Text inside Avatar
        val initialsText = TextView(this).apply {
            id = ID_INITIALS
            val initial = if (contactName.isNotBlank()) contactName.take(1).uppercase() else "J"
            text = initial
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 20f)
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
        }
        avatarContainer.addView(initialsText, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ))

        // 3. Avatar Image (if URL is available)
        val avatarImage = ImageView(this).apply {
            id = ID_AVATAR_IMG
            scaleType = ImageView.ScaleType.CENTER_CROP
            visibility = View.GONE
        }
        avatarContainer.addView(avatarImage, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ))

        // 4. Online Indicator Dot
        val onlineDot = View(this).apply {
            id = ID_ONLINE_DOT
            val dotBg = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#10B981"))
                setStroke(dpToPx(1.5f), Color.parseColor("#0F172A"))
            }
            background = dotBg
            visibility = if (isOnline) View.VISIBLE else View.GONE
        }
        val dotLp = FrameLayout.LayoutParams(dpToPx(14f), dpToPx(14f)).apply {
            gravity = Gravity.BOTTOM or Gravity.END
            setMargins(0, 0, dpToPx(4f), dpToPx(4f))
        }
        root.addView(onlineDot, dotLp)

        // 5. Unread Count Badge
        val unreadBadge = TextView(this).apply {
            id = ID_UNREAD_BADGE
            val badgeBg = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = dpToPx(10f).toFloat()
                setColor(Color.parseColor("#EF4444")) // Red 500
                setStroke(dpToPx(1.5f), Color.parseColor("#0F172A"))
            }
            background = badgeBg
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            setPadding(dpToPx(5f), dpToPx(1f), dpToPx(5f), dpToPx(1f))
            text = if (unreadCount > 99) "99+" else unreadCount.toString()
            visibility = if (unreadCount > 0) View.VISIBLE else View.GONE
        }
        val badgeLp = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT,
            dpToPx(20f)
        ).apply {
            gravity = Gravity.TOP or Gravity.END
            setMargins(0, 0, dpToPx(2f), 0)
        }
        root.addView(unreadBadge, badgeLp)

        loadAvatarImage(avatarUrl)

        // Drag & Touch Handling
        root.setOnTouchListener(object : View.OnTouchListener {
            private var initialX = 0
            private var initialY = 0
            private var initialTouchX = 0f
            private var initialTouchY = 0f
            private var touchStartTime = 0L
            private var isDragging = false

            override fun onTouch(v: View?, event: MotionEvent): Boolean {
                val params = layoutParams ?: return false

                when (event.action) {
                    MotionEvent.ACTION_DOWN -> {
                        initialX = params.x
                        initialY = params.y
                        initialTouchX = event.rawX
                        initialTouchY = event.rawY
                        touchStartTime = System.currentTimeMillis()
                        isDragging = false
                        return true
                    }

                    MotionEvent.ACTION_MOVE -> {
                        val dx = (event.rawX - initialTouchX).toInt()
                        val dy = (event.rawY - initialTouchY).toInt()

                        if (Math.hypot(dx.toDouble(), dy.toDouble()) > dpToPx(6f)) {
                            if (!isDragging) {
                                isDragging = true
                                showDismissTarget()
                            }
                            params.x = initialX + dx
                            params.y = initialY + dy
                            windowManager?.updateViewLayout(chatHeadView, params)

                            // Check proximity to dismiss target
                            checkDismissHover(params.x, params.y)
                        }
                        return true
                    }

                    MotionEvent.ACTION_UP -> {
                        hideDismissTarget()
                        val clickDuration = System.currentTimeMillis() - touchStartTime
                        val totalDist = Math.hypot(
                            (event.rawX - initialTouchX).toDouble(),
                            (event.rawY - initialTouchY).toDouble()
                        )

                        if (totalDist < dpToPx(10f) && clickDuration < 300) {
                            // User Tapped the Chat Head: Open Conversation directly!
                            openConversation()
                            return true
                        }

                        if (isDragging) {
                            // Check if dropped near dismiss target (bottom center)
                            if (isHoveringDismiss(params.x, params.y)) {
                                removeChatHead()
                                stopSelf()
                                return true
                            }

                            // Snap to nearest screen edge
                            snapToNearestEdge(params.x, params.y)
                        }
                        return true
                    }
                }
                return false
            }
        })

        try {
            windowManager?.addView(chatHeadView, layoutParams)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun setupDismissTarget() {
        val targetSize = dpToPx(68f)
        val layoutType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }

        dismissParams = WindowManager.LayoutParams(
            targetSize,
            targetSize,
            layoutType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
            y = dpToPx(36f)
        }

        dismissTargetView = FrameLayout(this).apply {
            val bg = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#99000000"))
                setStroke(dpToPx(2f), Color.parseColor("#EF4444"))
            }
            background = bg

            val xView = TextView(context).apply {
                text = "✕"
                setTextColor(Color.WHITE)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
                typeface = Typeface.DEFAULT_BOLD
                gravity = Gravity.CENTER
            }
            addView(xView, FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            ))
            visibility = View.GONE
        }

        try {
            windowManager?.addView(dismissTargetView, dismissParams)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun showDismissTarget() {
        dismissTargetView?.visibility = View.VISIBLE
    }

    private fun hideDismissTarget() {
        dismissTargetView?.visibility = View.GONE
    }

    private fun checkDismissHover(headX: Int, headY: Int) {
        val isHover = isHoveringDismiss(headX, headY)
        dismissTargetView?.let { dt ->
            val bg = dt.background as? GradientDrawable
            if (isHover) {
                bg?.setColor(Color.parseColor("#EF4444"))
                dt.scaleX = 1.15f
                dt.scaleY = 1.15f
            } else {
                bg?.setColor(Color.parseColor("#99000000"))
                dt.scaleX = 1.0f
                dt.scaleY = 1.0f
            }
        }
    }

    private fun isHoveringDismiss(headX: Int, headY: Int): Boolean {
        updateScreenDimensions()
        val centerX = screenWidth / 2
        val targetY = screenHeight - dpToPx(80f)
        val headCenterX = headX + dpToPx(31f)
        val headCenterY = headY + dpToPx(31f)

        val dist = Math.hypot((headCenterX - centerX).toDouble(), (headCenterY - targetY).toDouble())
        return dist < dpToPx(90f)
    }

    private fun snapToNearestEdge(currentX: Int, currentY: Int) {
        updateScreenDimensions()
        val headWidth = dpToPx(62f)
        val targetX = if (currentX + headWidth / 2 < screenWidth / 2) {
            dpToPx(12f)
        } else {
            screenWidth - headWidth - dpToPx(12f)
        }

        val clampedY = Math.max(dpToPx(50f), Math.min(screenHeight - dpToPx(160f), currentY))

        val params = layoutParams ?: return
        val animator = ValueAnimator.ofInt(params.x, targetX).apply {
            duration = 220
            interpolator = DecelerateInterpolator()
            addUpdateListener { va ->
                params.x = va.animatedValue as Int
                params.y = clampedY
                try {
                    windowManager?.updateViewLayout(chatHeadView, params)
                } catch (e: Exception) {}
            }
        }
        animator.start()
    }

    private fun updateChatHeadContent(avatarUrl: String?) {
        val root = chatHeadView ?: return

        root.findViewById<TextView>(ID_INITIALS)?.apply {
            text = if (contactName.isNotBlank()) contactName.take(1).uppercase() else "J"
        }

        root.findViewById<View>(ID_ONLINE_DOT)?.apply {
            visibility = if (isOnline) View.VISIBLE else View.GONE
        }

        root.findViewById<TextView>(ID_UNREAD_BADGE)?.apply {
            text = if (unreadCount > 99) "99+" else unreadCount.toString()
            visibility = if (unreadCount > 0) View.VISIBLE else View.GONE
        }

        loadAvatarImage(avatarUrl)
    }

    private fun loadAvatarImage(url: String?) {
        val imgView = chatHeadView?.findViewById<ImageView>(ID_AVATAR_IMG) ?: return
        val initials = chatHeadView?.findViewById<TextView>(ID_INITIALS) ?: return

        if (url.isNullOrBlank()) {
            imgView.visibility = View.GONE
            initials.visibility = View.VISIBLE
            return
        }

        thread {
            try {
                val stream = URL(url).openStream()
                val bitmap = BitmapFactory.decodeStream(stream)
                val circularBitmap = getCircularBitmap(bitmap)
                imgView.post {
                    imgView.setImageBitmap(circularBitmap)
                    imgView.visibility = View.VISIBLE
                    initials.visibility = View.GONE
                }
            } catch (e: Exception) {
                imgView.post {
                    imgView.visibility = View.GONE
                    initials.visibility = View.VISIBLE
                }
            }
        }
    }

    private fun getCircularBitmap(bitmap: Bitmap): Bitmap {
        val size = Math.min(bitmap.width, bitmap.height)
        val output = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(output)
        val paint = Paint().apply {
            isAntiAlias = true
            color = Color.BLACK
        }
        val rect = Rect(0, 0, size, size)
        canvas.drawCircle(size / 2f, size / 2f, size / 2f, paint)
        paint.xfermode = PorterDuffXfermode(PorterDuff.Mode.SRC_IN)
        canvas.drawBitmap(bitmap, rect, rect, paint)
        return output
    }

    private fun openConversation() {
        try {
            val intent = Intent(this, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                putExtra("chatId", contactId)
                putExtra("contactName", contactName)
                putExtra("fromChatHead", true)
            }
            startActivity(intent)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun removeChatHead() {
        chatHeadView?.let { view ->
            try {
                windowManager?.removeView(view)
            } catch (e: Exception) {}
        }
        chatHeadView = null

        dismissTargetView?.let { view ->
            try {
                windowManager?.removeView(view)
            } catch (e: Exception) {}
        }
        dismissTargetView = null
    }

    private fun createNotificationChannelIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Jaby Chat Heads",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows floating chat head over other apps"
                setShowBadge(false)
            }
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.createNotificationChannel(channel)
        }
    }

    override fun onDestroy() {
        removeChatHead()
        super.onDestroy()
    }

    companion object {
        const val ACTION_SHOW = "com.jaby.securemessenger.SHOW_CHAT_HEAD"
        const val ACTION_HIDE = "com.jaby.securemessenger.HIDE_CHAT_HEAD"

        const val EXTRA_CONTACT_ID = "contactId"
        const val EXTRA_CONTACT_NAME = "contactName"
        const val EXTRA_AVATAR_URL = "avatarUrl"
        const val EXTRA_UNREAD_COUNT = "unreadCount"
        const val EXTRA_IS_ONLINE = "isOnline"

        private const val CHANNEL_ID = "jaby_chat_heads_channel"

        private val ID_INITIALS = View.generateViewId()
        private val ID_AVATAR_IMG = View.generateViewId()
        private val ID_ONLINE_DOT = View.generateViewId()
        private val ID_UNREAD_BADGE = View.generateViewId()
    }
}
