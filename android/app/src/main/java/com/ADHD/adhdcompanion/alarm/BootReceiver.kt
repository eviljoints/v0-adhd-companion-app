package com.adhd.adhdcompanion.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val now = System.currentTimeMillis()
        try {
            val alarms = AlarmStore.all(context)
            alarms.forEach { a ->
                val whenAt = if (a.at <= now) now + 1000 else a.at // fire soon if missed
                AlarmScheduler.scheduleExact(context, a.id, whenAt, a.title, a.body)
            }
            Log.d("BootReceiver", "Re-scheduled ${alarms.size} alarms")
        } catch (e: Throwable) {
            Log.e("BootReceiver", "Failed to reschedule", e)
        }
    }
}
