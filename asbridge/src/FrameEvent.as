package {

  import flash.events.Event;
  import flash.utils.ByteArray;

  public class FrameEvent extends Event {

    public static const FRAME:String = "frame";

    private var _frame:ByteArray;

    function FrameEvent(frame:ByteArray) {
      super(FrameEvent.FRAME, false, false);
      _frame = frame;
    }

    public function get frame():ByteArray {
      return _frame;
    }
  }
}