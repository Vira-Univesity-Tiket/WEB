
import React from 'react';
import { 
  Bus,
  Utensils,
  Bed,
  Book,
  Calendar,
  Map,
  Bell,
  Users,
  User, 
  MessageSquare, 
  ChevronDown, 
  ArrowRight,
  MapPin,
  Search,
  Clock,
  Ticket,
  QrCode,
  Armchair,
  Wallet,
  Plus,
  CreditCard,
  ArrowUpRight,
  ArrowDownLeft,
  Car,
  Bike,
  Headset,
  X,
  Moon,
  Sun,
  Star,
  Navigation,
  CheckCircle,
  AlertCircle,
  Info,
  Shield,
  Lock,
  BarChart2,
  Settings,
  Menu,
  LogOut,
  Activity,
  PlusSquare,
  AlertTriangle,
  Key,
  TrendingUp,
  PieChart,
  FileText,
  RefreshCw,
  UploadCloud,
  Download,
  Camera
} from 'lucide-react';

export const Icons = {
  Bus,
  Utensils,
  Bed,
  Book,
  Calendar,
  Map,
  Bell,
  Users,
  User, 
  MessageSquare, 
  ChevronDown, 
  ArrowRight,
  MapPin,
  Search,
  Clock,
  Ticket,
  QrCode,
  Armchair,
  Wallet,
  Plus,
  CreditCard,
  ArrowUpRight,
  ArrowDownLeft,
  Car,
  Bike,
  Headset,
  X,
  Moon,
  Sun,
  Star,
  Navigation,
  CheckCircle,
  AlertCircle,
  Info,
  Shield,
  Lock,
  BarChart2,
  Settings,
  Menu,
  LogOut,
  Activity,
  PlusSquare,
  AlertTriangle,
  Key,
  TrendingUp,
  PieChart,
  FileText,
  RefreshCw,
  UploadCloud,
  Download,
  Camera
};

export const getIcon = (name: string, props: any) => {
  switch(name) {
    case 'bus': return <Bus {...props} />;
    case 'utensils': return <Utensils {...props} />;
    case 'bed': return <Bed {...props} />;
    case 'book': return <Book {...props} />;
    case 'calendar': return <Calendar {...props} />;
    case 'map': return <Map {...props} />;
    case 'bell': return <Bell {...props} />;
    case 'users': return <Users {...props} />;
    case 'ticket': return <Ticket {...props} />;
    case 'taxi': return <Icons.Car {...props} />;
    case 'bike': return <Icons.Bike {...props} />;
    case 'wallet': return <Wallet {...props} />;
    case 'support': return <Headset {...props} />;
    case 'feedback': return <MessageSquare {...props} />;
    default: return <Bus {...props} />;
  }
};
