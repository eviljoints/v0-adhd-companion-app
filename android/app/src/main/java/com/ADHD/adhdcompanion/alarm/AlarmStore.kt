package com.adhd.adhdcompanion.alarm

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

object AlarmStore {
    private const val PREFS = "alarm_store"
    private const val KEY = "alarms"

    data class Scheduled(val id: Int, val at: Long, val title: String, val body: String)

    fun add(context: Context, id: Int, at: Long, title: String, body: String) {
        val list = all(context).toMutableList()
        list.removeAll { it.id == id }
        list.add(Scheduled(id, at, title, body))
        save(context, list)
    }

    fun remove(context: Context, id: Int) {
        val list = all(context).filter { it.id != id }
        save(context, list)
    }

    fun all(context: Context): List<Scheduled> {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val json = prefs.getString(KEY, "[]") ?: "[]"
        val arr = JSONArray(json)
        val out = mutableListOf<Scheduled>()
        for (i in 0 until arr.length()) {
            val o = arr.getJSONObject(i)
            out.add(Scheduled(
                o.getInt("id"),
                o.getLong("at"),
                o.optString("title", "Reminder"),
                o.optString("body", "Time’s up!")
            ))
        }
        return out
    }

    private fun save(context: Context, list: List<Scheduled>) {
        val arr = JSONArray()
        list.forEach {
            val o = JSONObject()
            o.put("id", it.id)
            o.put("at", it.at)
            o.put("title", it.title)
            o.put("body", it.body)
            arr.put(o)
        }
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        prefs.edit().putString(KEY, arr.toString()).apply()
    }
}
