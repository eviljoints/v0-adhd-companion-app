package com.adhd.adhdcompanion.alarm

import android.media.MediaPlayer
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.view.WindowManager
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.adhd.adhdcompanion.R

class FullScreenAlarmActivity : AppCompatActivity() {
    private var mp: MediaPlayer? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Turn screen on + show over lock
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                        WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                        WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            )
        }

        setContentView(R.layout.activity_fullscreen_alarm)

        findViewById<TextView>(R.id.titleText).text = intent.getStringExtra("title") ?: "Reminder"
        findViewById<TextView>(R.id.bodyText).text = intent.getStringExtra("body") ?: "Time’s up!"

        // Play alert.mp3 in loop
        mp = MediaPlayer.create(this, R.raw.alert).apply {
            isLooping = true
            start()
        }

        findViewById<Button>(R.id.stopBtn).setOnClickListener {
            finish()
        }

        findViewById<Button>(R.id.snoozeBtn).setOnClickListener {
            // 5-minute snooze
            val now = System.currentTimeMillis()
            AlarmScheduler.scheduleExact(
                this,
                (now % Int.MAX_VALUE).toInt(),
                now + 5 * 60 * 1000L,
                "Snoozed reminder",
                "It's time again"
            )
            finish()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        try { mp?.stop() } catch (_: Throwable) {}
        mp?.release()
        mp = null
    }
}
