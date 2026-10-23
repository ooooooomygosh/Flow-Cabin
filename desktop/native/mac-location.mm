#include <node_api.h>
#import <Foundation/Foundation.h>
#import <CoreLocation/CoreLocation.h>
#include <string>
#include <cmath>

static NSMutableSet *requests;
static void Deliver(napi_env env,napi_value callback,void*,void* data){auto text=static_cast<std::string*>(data);if(env&&callback){napi_value global,value,result;napi_get_global(env,&global);napi_create_string_utf8(env,text->c_str(),text->size(),&value);napi_call_function(env,global,callback,1,&value,&result);}delete text;}
@interface CabinLocationRequest : NSObject<CLLocationManagerDelegate>
@property(nonatomic,strong) CLLocationManager *manager;
@property(nonatomic,strong) CLGeocoder *geocoder;
@property(nonatomic,assign) napi_threadsafe_function callback;
@property(nonatomic,assign) BOOL completed;
@property(nonatomic,assign) BOOL locating;
-(void)start;
-(void)finish:(NSDictionary*)value;
@end
@implementation CabinLocationRequest
-(void)finish:(NSDictionary*)value {if(self.completed)return;self.completed=YES;[self.manager stopUpdatingLocation];self.manager.delegate=nil;[self.geocoder cancelGeocode];NSData *data=[NSJSONSerialization dataWithJSONObject:value options:0 error:nil];auto payload=new std::string((const char*)data.bytes,data.length);if(napi_call_threadsafe_function(self.callback,payload,napi_tsfn_nonblocking)!=napi_ok)delete payload;napi_release_threadsafe_function(self.callback,napi_tsfn_release);[requests removeObject:self];}
-(void)start {if(![CLLocationManager locationServicesEnabled]){[self finish:@{@"status":@"disabled"}];return;}self.manager=[CLLocationManager new];self.manager.delegate=self;self.manager.desiredAccuracy=kCLLocationAccuracyThreeKilometers;[self authorize];dispatch_after(dispatch_time(DISPATCH_TIME_NOW,20*NSEC_PER_SEC),dispatch_get_main_queue(),^{[self finish:@{@"status":@"timeout"}];});}
-(void)authorize {switch(self.manager.authorizationStatus){case kCLAuthorizationStatusDenied:case kCLAuthorizationStatusRestricted:[self finish:@{@"status":@"denied"}];break;case kCLAuthorizationStatusNotDetermined:[self.manager requestWhenInUseAuthorization];break;default:if(!self.locating){self.locating=YES;[self.manager requestLocation];}break;}}
-(void)locationManagerDidChangeAuthorization:(CLLocationManager*)manager{if(!self.completed)[self authorize];}
-(void)locationManager:(CLLocationManager*)manager didFailWithError:(NSError*)error{if(error.code==kCLErrorLocationUnknown)return;[self finish:@{@"status":error.code==kCLErrorDenied?@"denied":@"unavailable"}];}
-(void)locationManager:(CLLocationManager*)manager didUpdateLocations:(NSArray<CLLocation*>*)locations {
 if(self.completed || self.geocoder)return;CLLocation *loc=locations.lastObject;if(!loc || loc.horizontalAccuracy<0 || -loc.timestamp.timeIntervalSinceNow>300)return;
 double lat=round(loc.coordinate.latitude*100.0)/100.0,lng=round(loc.coordinate.longitude*100.0)/100.0;
 NSMutableDictionary *result=[@{@"status":@"available",@"lat":@(lat),@"lng":@(lng),@"name":@"附近",@"zone":[NSTimeZone localTimeZone].name,@"at":@((long long)(NSDate.date.timeIntervalSince1970*1000))} mutableCopy];
 [manager stopUpdatingLocation];self.geocoder=[CLGeocoder new];
 [self.geocoder reverseGeocodeLocation:[[CLLocation alloc]initWithLatitude:lat longitude:lng] completionHandler:^(NSArray<CLPlacemark*>* places,NSError* error){CLPlacemark *place=places.firstObject;NSString *name=place.locality ?: place.administrativeArea;if(name.length)result[@"name"]=name;if(place.timeZone)result[@"zone"]=place.timeZone.name;[self finish:result];}];
 dispatch_after(dispatch_time(DISPATCH_TIME_NOW,3*NSEC_PER_SEC),dispatch_get_main_queue(),^{[self finish:result];});
}
@end
static napi_value Request(napi_env env,napi_callback_info info){size_t argc=1;napi_value argv[1];napi_get_cb_info(env,info,&argc,argv,nullptr,nullptr);napi_valuetype type;if(argc!=1||napi_typeof(env,argv[0],&type)!=napi_ok||type!=napi_function){napi_throw_type_error(env,nullptr,"callback required");return nullptr;}napi_threadsafe_function callback;napi_value name;napi_create_string_utf8(env,"CabinApproximateLocation",NAPI_AUTO_LENGTH,&name);napi_create_threadsafe_function(env,argv[0],nullptr,name,1,1,nullptr,nullptr,nullptr,Deliver,&callback);dispatch_async(dispatch_get_main_queue(),^{if(!requests)requests=[NSMutableSet new];CabinLocationRequest *request=[CabinLocationRequest new];request.callback=callback;[requests addObject:request];[request start];});napi_value result;napi_get_undefined(env,&result);return result;}
static napi_value Init(napi_env env,napi_value exports){napi_value fn;napi_create_function(env,"request",NAPI_AUTO_LENGTH,Request,nullptr,&fn);napi_set_named_property(env,exports,"request",fn);return exports;}
NAPI_MODULE(NODE_GYP_MODULE_NAME,Init)
