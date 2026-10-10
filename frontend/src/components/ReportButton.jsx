import { useState } from "react";
import { Flag } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { errMsg, reportEpisode } from "@/lib/api";

export const ReportButton = ({ ep }) => {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const send = async () => {
    try {
      const r = await reportEpisode(ep.id, "reported from episode page");
      setDone(true);
      toast.success(r.hidden ? "Episode pulled from the archive." : "Reported. Three reports pull an episode.");
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  return (
    <>
      <button
        type="button"
        data-testid="report-btn"
        disabled={done}
        onClick={() => setOpen(true)}
        className="font-osd text-lg text-slate-500 hover:text-red-400 inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
      >
        <Flag className="w-4 h-4" /> {done ? "Reported" : "Report this episode"}
      </button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent className="bg-ink-2 border-tape/30" data-testid="report-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-3xl tracking-wide">Report this episode?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-300">
              Use this if the episode is hateful, targets something it shouldn't, or you are @{ep.handle} and want it gone.
              Three reports hide it automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="report-cancel" className="font-osd text-lg">Cancel</AlertDialogCancel>
            <AlertDialogAction data-testid="report-confirm" onClick={send} className="bg-red-500 hover:bg-red-600 text-white font-display text-xl tracking-wider">
              Report
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
