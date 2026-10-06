import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { KeyRound, Lock } from "lucide-react";
import { updateSourceCredentials } from "@/lib/api.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Lets the owner save or change a platform login (e.g. IRCTC monthly password change). */
export function CredentialsDialog({ sourceId, name, open, onOpenChange, onSaved }: {
  sourceId: string; name: string; open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void;
}) {
  const save = useServerFn(updateSourceCredentials);
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><KeyRound className="size-4" />Change password — {name}</DialogTitle>
          <DialogDescription>Password badla hai? Naya yahan daalein. Purane orders aur settings safe rahenge.</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault(); setBusy(true);
          try {
            await save({ data: { sourceId, account, password, otp: otp || undefined } });
            toast.success("Login saved securely"); setPassword(""); setOtp(""); onSaved(); onOpenChange(false);
          } catch (err) { toast.error(err instanceof Error ? err.message : "Could not save"); }
          setBusy(false);
        }}>
          <div className="space-y-1.5"><Label>Email ID / User ID</Label><Input required value={account} onChange={(e) => setAccount(e.target.value)} autoComplete="off" /></div>
          <div className="space-y-1.5"><Label>New password</Label><Input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></div>
          <div className="space-y-1.5"><Label>OTP (only if asked, first time)</Label><Input value={otp} onChange={(e) => setOtp(e.target.value)} inputMode="numeric" maxLength={12} /></div>
          <p className="flex gap-1.5 text-xs text-muted-foreground"><Lock className="size-3.5 shrink-0" />Encrypted on our server. It is never shown again, not even to staff.</p>
          <DialogFooter><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="saffron" disabled={busy}>{busy ? "Saving…" : "Save password"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
