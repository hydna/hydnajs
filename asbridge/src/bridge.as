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

  [SWF( backgroundColor='0xFFFFFF', frameRate='30', width='500', height='500')]

  public class bridge extends Sprite {

    private var _output:TextField;

    private var _externalHandshake:String;
    private var _externalReady:String;
    private var _externalOpen:String;
    private var _externalMessage:String;
    private var _externalClose:String;
    private var _externalError:String;

    private var _connections:Dictionary;


    function bridge(){
      var vars:Object;

      Security.allowDomain("*");

      vars = LoaderInfo(this.root.loaderInfo).parameters;

      _externalHandshake = vars.onhandshake;
      _externalReady = vars.onready;
      _externalOpen = vars.onopen;
      _externalMessage = vars.onmessage;
      _externalClose = vars.onclose;
      _externalError = vars.onerror;

      _output = new TextField();
      _output.width = 500;
      _output.height = 500;
      _output.text = "ExternalInterface.available: " + ExternalInterface.available.toString();
      addChild( _output );

      for (var i:String in vars){
        _output.appendText( "\n"+ i +":" + vars[i]);
      }

      if (ExternalInterface.available) {
        try{
          ExternalInterface.addCallback("send", this.send );
          ExternalInterface.addCallback("init", this.init );
          ExternalInterface.addCallback("close", this.close );
          trace( "main -> created callbacks" );
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
      var frame:ByteArray = new ByteArray();
      var payload:ByteArray = null;
      var payloadlen:Number = 0;
      var head:ByteArray;
      var ch:Number;
      var desc:Number;

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
        return
      }

      head = Base64.decode(data.substr(0, 8));
      head.position = 0;

      ch = head.readUnsignedInt();
      desc= head.readByte();

      if (data.length > 8) {
        payload = Base64.decode(data.substr(8));
        payloadlen = payload.length;
      }

      frame.writeShort( 0x07 + payloadlen );
      frame.writeUnsignedInt(ch);
      frame.writeByte(desc);

      if (payloadlen > 0) {
        frame.writeBytes(payload, 0, payloadlen);
      }

      conn.send(frame);
    }


    public function init(id:int, url:String) : Boolean {
      var conn:Connection;

      if (_connections == null) {
        _connections = new Dictionary();
      }

      if (_connections[id]) {
        return false;
      }

      conn = new Connection(id);
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
          trace( "main -> we are openfor business on: "+ target.id);
          _output.appendText( "\nwe are openfor business on: "+ target.id);
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
                               "ERR_BRIDGE: " + (e.text || "Unknown Error"));
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
                               "ERR_BRIDGE: " + (e.text || ""));
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
      var tmp:ByteArray;
      var frame:String;

      tmp = new ByteArray();
      e.frame.readBytes(tmp, 0, 5);
      frame = Base64.encode(tmp);

      if (e.frame.bytesAvailable) {
        tmp = new ByteArray();
        e.frame.readBytes(tmp);
        frame += Base64.encode(tmp);
      }

      try {
        ExternalInterface.call(_externalMessage, e.target.id, frame);
      } catch(e:Error) {
        trace( "main -> problem with 'handleFrame' func." );
      }
    }


    private function handshake() : Boolean {
      var ready:Boolean = false;

      try {
        ready = ExternalInterface.call(_externalHandshake);
      } catch(e:Error) {
        return false;
      }

      if (!ready) {
        setTimeout(this.handshake, 10);
      }

      try {
        ExternalInterface.call(_externalReady);
      } catch(e:Error) {
        trace( "main -> problem with 'handshake' func." );
      }

      return true;
    }

  }
}