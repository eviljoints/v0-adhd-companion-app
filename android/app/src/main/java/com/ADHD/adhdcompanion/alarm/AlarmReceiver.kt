package com.adhd.adhdcompanion.alarm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import com.adhd.adhdcompanion.R
import com.adhd.adhdcompanion.alarm.FullScreenAlarmActivity

class AlarmReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val alarmId = intent.getIntExtra("alarmId", (System.currentTimeMillis() % Int.MAX_VALUE).toInt())
        val title = intent.getStringExtra("title") ?: "Reminder"
        val body = intent.getStringExtra("body") ?: "Time’s up!"

        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        ensureChannel(nm, context)

        // PendingIntent to launch the full-screen Activity
        val fullScreenIntent = Intent(context, FullScreenAlarmActivity::class.java).apply {
            putExtra("title", title)
            putExtra("body", body)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        val fullScreenPi = PendingIntent.getActivity(
            context,
            alarmId,
            fullScreenIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val n: Notification = NotificationCompat.Builder(context, "alarms")
            .setSmallIcon(R.mipmap.ic_launcher) // or your own small icon
            .setContentTitle(title)
            .setContentText(body)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)            // sticky until user dismisses in the Activity
            .setAutoCancel(false)
            .setFullScreenIntent(fullScreenPi, true) // <-- key for heads-up / fullscreen
            .setSound(Uri.parse("android.resource://${context.packageName}/raw/alert"))
            .setVibrate(longArrayOf(0, 800, 500, 800, 500, 800))
            .build()

        nm.notify(alarmId, n)
    }

    private fun ensureChannel(nm: NotificationManager, context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channelId = "alarms"
            val existing = nm.getNotificationChannel(channelId)
            if (existing == null) {
                val soundUri = Uri.parse("android.resource://${context.packageName}/raw/alert")
                val attrs = AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
                val ch = NotificationChannel(
                    channelId,
                    "Alarms",
                    NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    description = "Time & location reminders"
                    enableVibration(true)
                    setSound(soundUri, attrs)
                    lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                }
                nm.createNotificationChannel(ch)
            }
        }
    }
}
