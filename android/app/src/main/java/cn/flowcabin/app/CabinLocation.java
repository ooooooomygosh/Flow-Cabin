package cn.flowcabin.app;

import android.content.Context;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import com.getcapacitor.JSObject;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;

// One foreground request with coarse permission only. No service or tracking loop.
final class CabinLocation {
    private final Context context;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final AtomicBoolean finished = new AtomicBoolean(false);
    private LocationManager manager;
    private LocationListener listener;
    private Consumer<JSObject> callback;
    CabinLocation(Context context) { this.context=context; }
    void request(Consumer<JSObject> callback) { this.callback=callback; main.post(this::start); }
    private void finish(JSObject value) { if (!finished.compareAndSet(false,true)) return; main.removeCallbacksAndMessages(null); try { if(manager!=null && listener!=null) manager.removeUpdates(listener); } catch(SecurityException ignored){} if(callback!=null) callback.accept(value); }
    void cancel() { main.post(() -> finish(new JSObject().put("status","unavailable"))); }
    private void accept(Location location) {
        if(location==null || !location.hasAccuracy() || System.currentTimeMillis()-location.getTime()>300000) return;
        finish(new JSObject().put("status","available").put("lat",Math.round(location.getLatitude()*100.0)/100.0).put("lng",Math.round(location.getLongitude()*100.0)/100.0).put("name","附近").put("zone",java.util.TimeZone.getDefault().getID()).put("at",System.currentTimeMillis()));
    }
    @SuppressWarnings("MissingPermission") private void start() {
        if(context.checkSelfPermission(android.Manifest.permission.ACCESS_COARSE_LOCATION)!=android.content.pm.PackageManager.PERMISSION_GRANTED){finish(new JSObject().put("status","denied"));return;}
        manager=(LocationManager)context.getSystemService(Context.LOCATION_SERVICE);
        if(manager==null || !manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)){finish(new JSObject().put("status","disabled"));return;}
        listener=new LocationListener(){@Override public void onLocationChanged(Location location){accept(location);}@Override public void onProviderDisabled(String provider){finish(new JSObject().put("status","disabled"));}@Override public void onProviderEnabled(String provider){}@Override public void onStatusChanged(String provider,int status,Bundle extras){}};
        try { Location cached=manager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER);if(cached!=null){accept(cached);if(finished.get())return;}manager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER,0,0,listener,Looper.getMainLooper());main.postDelayed(()->finish(new JSObject().put("status","timeout")),18000); }
        catch(SecurityException error){finish(new JSObject().put("status","denied"));}catch(Exception error){finish(new JSObject().put("status","unavailable"));}
    }
}
