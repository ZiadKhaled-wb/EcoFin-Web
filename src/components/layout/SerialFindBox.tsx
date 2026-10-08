import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import Input from '@/components/ui/Input';
import { useCan } from '@/features/me/useCan';
import { t } from '@/i18n';

/**
 * I04 "search by serial from anywhere": a box in the top bar (wide screens, stock.view). Enter
 * opens /inventory/units?serial=..., which jumps to the unit or lists similar serials.
 */
export default function SerialFindBox() {
  const canView = useCan('stock.view');
  const navigate = useNavigate();
  const [serial, setSerial] = useState('');
  if (!canView) return null;

  function submit(e: FormEvent) {
    e.preventDefault();
    const value = serial.trim();
    if (!value) return;
    navigate(`/inventory/units?serial=${encodeURIComponent(value)}`);
    setSerial('');
  }

  return (
    <form role="search" onSubmit={submit} className="hidden w-52 lg:block">
      <Input
        aria-label={t('stock.units.find.label')}
        placeholder={t('stock.units.find.placeholder')}
        value={serial}
        ltr
        maxLength={64}
        autoComplete="off"
        onChange={(e) => setSerial(e.target.value)}
      />
    </form>
  );
}
