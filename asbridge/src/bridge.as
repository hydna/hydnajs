package {

  import flash.display.*;
  import flash.net.*;
  import flash.events.*;
  import flash.errors.*;
  import flash.utils.*;
  import flash.text.TextField;
  import flash.external.ExternalInterface;
  import flash.utils.*;
  import flash.system.Security;

  /* When debugging, change to width=`500` and height=`800` */

  [SWF( backgroundColor='0xffffff', frameRate='60', width='1', height='1')]
  public class bridge extends Sprite {

    private static var DEBUG:Boolean = false;

    private var _output:TextField;

    private var _externalHandshake:String;
    private var _externalReady:String;
    private var _externalOpen:String;
    private var _externalMessage:String;
    private var _externalClose:String;
    private var _externalError:String;

    private var _connections:Dictionary;
    private var _userAgent:String;

    function bridge(){
      var vars:Object;

      Security.allowDomain("*");

      _userAgent = null;

      vars = LoaderInfo(this.root.loaderInfo).parameters;

      debug("EI available: " + ExternalInterface.available.toString());

      _externalHandshake = vars.onhandshake;
      _externalReady = vars.onready;
      _externalOpen = vars.onopen;
      _externalMessage = vars.onmessage;
      _externalClose = vars.onclose;
      _externalError = vars.onerror;

      if (ExternalInterface.available) {
        try{
          ExternalInterface.addCallback("send", this.send );
          ExternalInterface.addCallback("init", this.init );
          ExternalInterface.addCallback("close", this.close );
        }catch(e:Error){
          DEBUG && debug("Failed to initialize EI: " + e.message);
          return;
        }
        handshake();
      }
    }


    public function getConnection(id:Number) : Connection {
      var conn:Connection;

      if (_connections == null) {
        return null;
      }

      if(!(conn = _connections[id])){
        return null;
      }

      return conn;
    }


    public function send(id:int, data:String) : void {
      var conn:Connection = getConnection(id);
      var frame:ByteArray;

      if (conn == null) {
        return;
      }

      if (data.length < 8) {
        dealloc(conn);
        try {
          ExternalInterface.call(_externalError,
                                 conn.id,
                                 "ERR_BAD_DATA");
        } catch (e:Error) {
          DEBUG && debug("ExternalInterface error: " + e.message);
        }
        return;
      }

      try {
        frame = Base64.decode(data);
      } catch (e:Error) {
        try {
          ExternalInterface.call(_externalError,
                                 conn.id,
                                 "ERR_BAD_DATA");
        } catch (e:Error) {
          DEBUG && debug("ExternalInterface error: " + e.message);
        }
        return;
      }

      frame.position = 0;

      conn.writeShort(frame.length);
      conn.writeBytes(frame);
      conn.flush();
    }


    public function init(id:int, url:String) : Boolean {
      var conn:Connection;

      if (_connections == null) {
        _connections = new Dictionary();
      }

      if (_connections[id]) {
        return false;
      }

      DEBUG && debug("Inititialize URL: " + url);

      conn = new Connection(id, _userAgent);
      alloc(conn);

      conn.handshake(url);

      return true;
    }


    public function close(id:int) : void {
      var conn:Connection = getConnection(id);

      if (conn != null) {
        dealloc(conn);
      }
    }


    private function alloc(conn:Connection) : void {
      conn.addEventListener(HTTPStatusEvent.HTTP_STATUS, handshakeHandler);
      conn.addEventListener(IOErrorEvent.IO_ERROR, ioErrorHandler);
      conn.addEventListener(SecurityErrorEvent.SECURITY_ERROR, securityHandler);
      conn.addEventListener(Event.CLOSE, closeHandler);
      conn.addEventListener(FrameEvent.FRAME, frameHandler);

      _connections[conn.id] = conn;
    }


    private function dealloc(conn:Connection) : void {
      conn.removeEventListener(HTTPStatusEvent.HTTP_STATUS, handshakeHandler);
      conn.removeEventListener(IOErrorEvent.IO_ERROR, ioErrorHandler);
      conn.removeEventListener(SecurityErrorEvent.SECURITY_ERROR, securityHandler);
      conn.removeEventListener(Event.CLOSE, closeHandler);
      conn.removeEventListener(FrameEvent.FRAME, frameHandler);

      if (conn.connected) {
        conn.close();
      }

      delete _connections[conn.id];
    }


    private function handshakeHandler(e:CustomStatusEvent) : void {
      var target:Connection = Connection(e.target);
      var header:URLRequestHeader;
      var url:String;

      switch (e.status) {
        case 101:
          try {
            ExternalInterface.call(_externalOpen, target.id);
          } catch (e:Error) {
            DEBUG && debug("ExternalInterface error: " + e.message);
          }
          break;

        default:

          dealloc(target);

          try {
            ExternalInterface.call(_externalError,
                                   target.id,
                                   "Handshake error " +
                                      (e.status || 500) +
                                      "(" +
                                      (e.body || "Unknown Error")
                                      + ")");
          } catch (e:Error) {
            DEBUG && debug("ExternalInterface error: " + e.message);
          }
          break;
      }
    }


    private function ioErrorHandler(e:IOErrorEvent) : void {
      var target:Connection = Connection(e.target);

      dealloc(target);

      try {
        ExternalInterface.call(_externalError,
                               target.id,
                               (e.text || "UNKNOWN_ERROR"));
      } catch (e:Error) {
        DEBUG && debug("ExternalInterface error: " + e.message);
      }
    }


    private function securityHandler(e:SecurityErrorEvent) : void {
      var target:Connection = Connection(e.target);

      dealloc(target);

      try {
        ExternalInterface.call(_externalError,
                               target.id,
                               (e.text || "SECURITY_ERROR"));
      } catch (e:Error) {
        DEBUG && debug("ExternalInterface error: " + e.message);
      }
    }


    private function closeHandler(e:Event) : void {
      var target:Connection = Connection(e.target);

      dealloc(target);

      try {
        ExternalInterface.call(_externalClose,
                               target.id,
                               "DISCONNECTED");
      } catch (e:Error) {
        DEBUG && debug("ExternalInterface error: " + e.message);
      }
    }


    private function frameHandler(e:FrameEvent) : void {
      var str:String;

      str = Base64.encode(e.frame);

      try {
        ExternalInterface.call(_externalMessage, e.target.id, str);
      } catch(e:Error) {
        DEBUG && debug("ExternalInterface error: " + e.message);
      }
    }


    private function handshake() : Boolean {

      DEBUG && debug("Try to handshake with client at: " + _externalHandshake);

      try {
        _userAgent = ExternalInterface.call(_externalHandshake);
        DEBUG && debug("Handshake result: " + _userAgent);
      } catch(e:Error) {
        DEBUG && debug("Handshake error: " + e.message);
        return false;
      }

      if (!_userAgent) {
        setTimeout(this.handshake, 10);
        return false;
      }

      try {
        DEBUG && debug("Call ready with client at: " + _externalReady);
        ExternalInterface.call(_externalReady);
      } catch(e:Error) {
        DEBUG && debug("Call ready error: " + e.message);
        return false;
      }

      DEBUG && debug("External Interface communication ready");

      return true;
    }

    private function debug(text:String) : void {

      if (DEBUG == false) {
        return;
      }

      if (_output == null) {
        _output = new TextField();
        _output.width = 500;
        _output.height = 800;
        _output.text = "";
        addChild(_output);
      }

      _output.appendText(text + "\n");
      trace(text);
    }
  }
}