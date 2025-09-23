package com.adhd.adhdcompanion.plugins

import com.getcapacitor.Plugin
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.JSObject
import com.getcapacitor.PluginCall
import android.content.Intent
import com.adhd.adhdcompanion.alarm.AlarmScheduler
import com.adhd.adhdcompanion.alarm.FullScreenAlarmActivity
import com.adhd.adhdcompanion.alarm.AlarmStore

@CapacitorPlugin(name = "AlarmPlugin")
class AlarmPlugin : Plugin() {

    @PluginMethod
    fun showFullScreenAlarm(call: PluginCall) {
        val title = call.getString("title") ?: "Reminder"
        val body = call.getString("body") ?: "Time’s up!"
        val i = Intent(context, FullScreenAlarmActivity::class.java).apply {
            putExtra("title", title)
            putExtra("body", body)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(i)
        call.resolve()
    }

    @PluginMethod
    fun scheduleFullScreenExact(call: PluginCall) {
        val id = call.getInt("id")
        val at = call.getLong("at")
        val title = call.getString("title") ?: "Reminder"
        val body = call.getString("body") ?: "Time’s up!"
        if (id == null || at == null) {
            call.reject("Missing 'id' or 'at'")
            return
        }
        AlarmScheduler.scheduleExact(context, id, at, title, body)
        AlarmStore.add(context, id, at, title, body) // <-- persist for reboot
        val ret = JSObject().put("scheduled", true)
        call.resolve(ret)
    }

    @PluginMethod
    fun cancelScheduled(call: PluginCall) {
        val id = call.getInt("id")
        if (id == null) {
            call.reject("Missing 'id'")
            return
        }
        AlarmScheduler.cancel(context, id)
        AlarmStore.remove(context, id) // <-- remove from store
        call.resolve(JSObject().put("canceled", true))
    }
}
