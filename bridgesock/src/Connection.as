package {

  import flash.net.*;
  import flash.events.*;
  import flash.errors.*;
  import flash.utils.*;


  public class Connection extends Socket {

    private var _id:Number;
    private var _url:Object;
    private var _followRedirects:Boolean;
    private var _attempt:Number;

    private var _receiveBuffer:ByteArray;
    private var _handshakeBuffer:String;


    function Connection(id:Number,
                        followRedirects:Boolean=true,
                        attempt:Number=1) {
      super();

      _id = id;
      _followRedirects = followRedirects;
      _attempt = attempt;
    }

    public function handshake(address:String) : void {
      var url:Object = URLParser.parse(address);

      _url = url;
      _attempt = attempt;
      _handshakeBuffer = "";

      trace("Handshake host: " + url.host + " port: " + url.port);

      this.addEventListener(Event.CONNECT, connectHandler);
      this.addEventListener(ProgressEvent.SOCKET_DATA, handshakeHandler);

      this.connect(url.host, url.port || 80);
    }


    public function send(frame:ByteArray) : void {
      trace( "Rawsocket -> sending data: " + frame.length );
      this.writeBytes(frame);
      this.flush();
    }


    private function connectHandler(event:Event) : void {
      var packet:Array = new Array();
      var token:String;

      trace("Rawsocket -> connected");
      this.removeEventListener(Event.CONNECT, connectHandler);

      // TODO: Initialize a handshake timeout handler

      token = "";

      packet[0] = "GET /" + token + " HTTP/1.1";
      packet[1] = "Connection: Upgrade";
      packet[2] = "Upgrade: winksock/1";
      packet[3] = "Host: " + _url.host;
      packet[4] = "X-Accept-Redirects: " + (_followRedirects ? "yes" : "no");
      packet[5] = "";

      this.writeMultiByte(packet.join("\r\n"), "us-ascii");
    }

    public static const END: String = "\r\n\r\n";
    private static const TOKEN_APPEND:String = "?t=";


    private function handshakeHandler(event:ProgressEvent) : void {
      var buffer:String;
      var splitted:Array;
      var head:Array;
      var body:String;
      var headers:Array;
      var m:Object;
      var status:Number;
      var ev:Event;

      buffer = readUTFBytes(bytesAvailable);

      _handshakeBuffer += buffer;

      splitted = _handshakeBuffer.split("\r\n\r\n");

      if (splitted.length == 1) {
        // Need more bytes here, header end was not received yet.
        return;
      }

      head = splitted[0];
      body = splitted[1];

      this.removeEventListener( ProgressEvent.SOCKET_DATA, handshakeHandler );

      trace( "Rawsocket -> complete handshake message" );

      m = /HTTP\/1\.1\s(\d+)/.exec(head[0]);

      if (!m) {
        ev = new IOErrorEvent(IOErrorEvent.IO_ERROR, false, false, "BAD_HTTP");
        dispatchEvent(ev);
        return;
      }

      if (isNaN(status = int(m[1]))) {
        ev = new IOErrorEvent(IOErrorEvent.IO_ERROR, false, false, "BAD_HTTP");
        dispatchEvent(ev);
        return;
      }

      if (status == 101) {
        // TODO: Add winksock/1 validation here!
        _receiveBuffer = new ByteArray();
        this.addEventListener(ProgressEvent.SOCKET_DATA, receiveHandler);
      }

      ev = new CustomStatusEvent(status);

      headers = new Array();

      for (var i:Number = 1; i < head.length; i++) {
        m = /(\.):\s+(|.)/.exec(head[i]);
        if (m) {
          headers.push(new URLRequestHeader(m[1].toLowerCase(), m[2]));
        }
      }

      CustomStatusEvent(ev).headers = headers;
      CustomStatusEvent(ev).body = body;

      dispatchEvent(ev);
    }


    // Handles all incomming data.
    private function receiveHandler(event:ProgressEvent) : void {
      var buffer:ByteArray = _receiveBuffer;
      var frameEvent:FrameEvent;
      var frame:ByteArray;
      var size:uint;

      trace("RawSocket -> receiving...");

      readBytes(buffer, buffer.length, bytesAvailable);

      trace("enter while looop");
      while (buffer.bytesAvailable >= 0x7) {
        size = buffer.readUnsignedShort();

        if (buffer.bytesAvailable < (size - 2)) {
          buffer.position -= 2;
          return;
        }

        frame = new ByteArray();
        buffer.readBytes(frame, 0, size - 2);

        frameEvent = new FrameEvent(frame);

        dispatchEvent(frameEvent);
      }

      if (buffer.bytesAvailable == 0) {
          _receiveBuffer = new ByteArray();
      }
    }


    public function get url() : Object{
      return _url;
    }


    public function get id() : Number {
      return _id;
    }


    public function get attempt() : Number {
      return _attempt;
    }


    public function get followRedirects() : Boolean {
      return _followRedirects;
    }

  }
}