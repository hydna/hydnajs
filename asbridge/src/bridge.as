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

  [SWF( backgroundColor='0xaaaaaa', frameRate='60', width='500', height='800')]

  public class bridge extends Sprite {

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

      _output = new TextField();
      _output.width = 500;
      _output.height = 800;
      _output.text = "ExternalInterface.available: " + ExternalInterface.available.toString();
      addChild( _output );

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
          trace("main -> failed creating callbacks: " + e.message );
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
          trace("ExternalInterface communcation problem");
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
          trace("ExternalInterface communcation problem");
        }
        return;
      }

      frame.position = 0;

      conn.writeShort(2 + frame.length);
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

      _output.appendText("\nHandshake url: " + url);

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
            trace("ExternalInterface communcation problem");
          }
          break;

        case 301:
        case 302:

          dealloc(target);

          if (target.attempt >= 5) {
            try {
              ExternalInterface.call(_externalError,
                                     target.id,
                                     "Too many redirect attempts");
            } catch (e:Error) {
              trace("ExternalInterface communcation problem");
            }
            return;
          }

          // Find location header
          for (var i:Number = 0; i < e.headers.length; i++) {
            header = URLRequestHeader(header);
            if (header && header.name == "location") {
              url = header.value;
              break;
            }
          }

          if (!url) {
            try {
              ExternalInterface.call(_externalError,
                                     target.id,
                                     "Server sent bad redirect response");
            } catch (e:Error) {
              trace("ExternalInterface communcation problem");
            }
            return;
          }


          target = new Connection(target.id,
                                  target.userAgent,
                                  target.followRedirects,
                                  target.attempt + 1);

          target.handshake(url);
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
            trace("ExternalInterface communcation problem");
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
        trace("ExternalInterface communcation problem");
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
        trace("ExternalInterface communcation problem");
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
        trace("ExternalInterface communcation problem");
      }
    }


    private function frameHandler(e:FrameEvent) : void {
      var str:String;

      str = Base64.encode(e.frame);

      try {
        ExternalInterface.call(_externalMessage, e.target.id, str);
      } catch(e:Error) {
        trace( "main -> problem with 'handleFrame' func." );
      }
    }


    private function handshake() : Boolean {

      _output.appendText( "\n TRY to call handshake: " + _externalHandshake);

      try {
        _userAgent = ExternalInterface.call(_externalHandshake);
        _output.appendText( "\n Answer was: " + _userAgent);
      } catch(e:Error) {
        _output.appendText( "\n ERROR!!");
        return false;
      }

      if (!_userAgent) {
        setTimeout(this.handshake, 1000);
        return false;
      }

      try {
        _output.appendText( "\n call externa ready ");
        ExternalInterface.call(_externalReady);
      } catch(e:Error) {
        _output.appendText( "\n error ");
        trace( "main -> problem with 'handshake' func." );
      }
      _output.appendText( "\n all ready ");

      return true;
    }

  }
}