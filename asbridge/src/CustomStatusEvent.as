package {

  import flash.events.HTTPStatusEvent;

  public class CustomStatusEvent extends HTTPStatusEvent {

    private var _headers:Array;
    private var _body:String;

    function CustomStatusEvent(status:Number) {
      super(HTTPStatusEvent.HTTP_STATUS, false, false, status);
    }

    public function get headers() : Array {
      return _headers;
    }

    public function set headers(v:Array) : void {
      _headers = v;
    }

    public function get body() : String {
      return _body;
    }

    public function set body(v:String) : void {
      _body = v;
    }
  }
}