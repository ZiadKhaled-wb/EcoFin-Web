import type { ComponentType, ReactElement } from 'react';
import {
  Bell,
  Calculator,
  Calendar,
  Check,
  ChartColumn,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Eye,
  EyeOff,
  Factory,
  Download,
  Inbox,
  KeyRound,
  LayoutDashboard,
  ListFilter,
  Lock,
  LogOut,
  Mail,
  Menu,
  Package,
  Pencil,
  Plus,
  Printer,
  ScanBarcode,
  Scale,
  Search,
  Settings,
  ShoppingCart,
  Trash2,
  Truck,
  User,
  UserCog,
  Users,
  Store,
  X,
  type LucideProps,
} from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * The ONLY place icons are imported from lucide-react. Everything else imports from here.
 * Defaults: 20px, 1.75 stroke, currentColor, aria-hidden (decorative).
 * Icon-only buttons must carry their own aria-label (see IconButton).
 */
export type IconComponent = (props: LucideProps) => ReactElement;

const wrap =
  (Icon: ComponentType<LucideProps>, mirrorInRtl = false): IconComponent =>
  (p) => (
    <Icon
      size={20}
      strokeWidth={1.75}
      aria-hidden
      {...p}
      className={cn(mirrorInRtl && 'rtl:-scale-x-100', p.className)}
    />
  );

// Fields and feedback
export const UserIcon = wrap(User);
export const LockIcon = wrap(Lock);
export const MailIcon = wrap(Mail);
export const KeyIcon = wrap(KeyRound);
export const EyeIcon = wrap(Eye);
export const EyeOffIcon = wrap(EyeOff);
export const AlertIcon = wrap(CircleAlert);
export const CheckCircleIcon = wrap(CircleCheck);
export const CheckIcon = wrap(Check);
export const SearchIcon = wrap(Search);
export const CalendarIcon = wrap(Calendar);
export const XIcon = wrap(X);
export const InboxIcon = wrap(Inbox);
export const ChevronDownIcon = wrap(ChevronDown);

// Direction-aware: "Start" points to the start edge, "End" toward the end edge (mirrored in RTL).
export const ChevronStartIcon = wrap(ChevronLeft, true);
export const ChevronEndIcon = wrap(ChevronRight, true);

// Navigation and actions
export const MenuIcon = wrap(Menu);
export const DashboardIcon = wrap(LayoutDashboard);
export const CartIcon = wrap(ShoppingCart);
export const PackageIcon = wrap(Package);
export const TruckIcon = wrap(Truck);
export const UsersIcon = wrap(Users);
export const FactoryIcon = wrap(Factory);
export const TeamIcon = wrap(UserCog);
export const CalculatorIcon = wrap(Calculator);
export const ChartIcon = wrap(ChartColumn);
export const SettingsIcon = wrap(Settings);
export const LogoutIcon = wrap(LogOut);
export const StoreIcon = wrap(Store);
export const BellIcon = wrap(Bell);
export const PlusIcon = wrap(Plus);
export const EditIcon = wrap(Pencil);
export const TrashIcon = wrap(Trash2);
export const PrintIcon = wrap(Printer);
export const DownloadIcon = wrap(Download);
export const FilterIcon = wrap(ListFilter);
export const BarcodeIcon = wrap(ScanBarcode);
export const ScaleIcon = wrap(Scale);
