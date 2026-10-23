using System;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using Windows.Devices.Geolocation;
class ApproximateLocation {
  [STAThread] static void Main() { try { Run().GetAwaiter().GetResult(); } catch { Print(new { status="unavailable" }); } }
  static void Print(object value) { Console.WriteLine(new JavaScriptSerializer().Serialize(value)); }
  static async Task Run() {
    var access=await Geolocator.RequestAccessAsync();
    if(access!=GeolocationAccessStatus.Allowed){Print(new { status="denied" });return;}
    var locator=new Geolocator { DesiredAccuracyInMeters=3000 };
    try { var position=await locator.GetGeopositionAsync(TimeSpan.FromMinutes(5),TimeSpan.FromSeconds(18));var coordinate=position.Coordinate.Point.Position;Print(new {status="available",lat=Math.Round(coordinate.Latitude,2),lng=Math.Round(coordinate.Longitude,2),name="附近",at=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}); }
    catch(UnauthorizedAccessException){Print(new {status="denied"});}catch {Print(new {status="timeout"});}
  }
}
