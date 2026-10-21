export interface CatalogProduct {
  id: string;
  sku: string;
  name: string;
  price: number;
  originalPrice?: number;
  stock: number;
  image: string;
  category: string;
}

export const mockCatalogProducts: CatalogProduct[] = [
  {
    id: "AO01",
    sku: "LINEN-CT-BE-01",
    name: "Áo Linen Cổ Tàu AO01",
    price: 199000,
    originalPrice: 350000,
    stock: 142,
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuCN1HM0WQdrr_aPmEMe0Cl8wizFb8WDejV5m6wCdRz6q7UI--ixUENZKNfJbNNvLQoBqJ62Y1-NBcucoIu8UxowTfx4WhFdksqOfE-uFZJ669tiXn17m2p1P7ar79sNfudY8II3sjKNBYN065RkDSqYmys7kVrYH4tv1VyGR8U72w06e5U3gprtdYZW0YXPg5Fi7Pl1DPEaVfjJKWYfqLOCn0BTeojeu4tgjkvIecs1msZjYoIN76jw",
    category: "Áo thời trang",
  },
  {
    id: "DM02",
    sku: "DRESS-MAXI-V02",
    name: "Đầm Maxi Hoa Vintage DM02",
    price: 289000,
    originalPrice: 450000,
    stock: 85,
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuBU1uMD3IdiOas9vgE4berSbUa9H-RZDA1K89Y8MFjeApvT_YO_I5RfzzRpiGSp0nPeZzviLB-PTmRl14w5VcIIYRS3JpNk9nMTx03LKrTQ3G5X8S-GnDl1Hb93Loh1E67idb4zaekdyjcYz_Ohl4EOn_EwFaw1I6U5vRVaGeSEDlhgW4wNjFEnXC6agB_R3H8mOWKwD9ZPcTofRj4Vaaw1X7vJkZgbs1L3zLnDDs0tB4JTD34hSNdH",
    category: "Đầm & Váy",
  },
  {
    id: "QJ02",
    sku: "PANT-JEAN-BL02",
    name: "Quần Jean Ống Suông QJ02",
    price: 249000,
    originalPrice: 390000,
    stock: 19,
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuAHEgEFw8xbjCGsTfqScmEaJBAvT2TboVYA_Jkn0Ws665Lqjb-Z2111ouHvjm_6gjOU5nU6wAqd8j1WHJBhDEbouCZR35AJXowtfQftYIc-8Esk94ok9xIynEOndHhTPHNUAlBFAqhxmWiyHHl4inbNAseNCaqKukMzzSnYW5-YAx9AtxpoJCQJViuWlQkptjDrvSmkfFm0EHibxW1OXQGGrk6pUFwca52A1kJpV6Gz_yHGzhzwQm5_",
    category: "Quần",
  },
  {
    id: "SM03",
    sku: "SMR-OXF-WH03",
    name: "Áo Sơ Mi Oxford Slim-Fit SM03",
    price: 260000,
    originalPrice: 380000,
    stock: 64,
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuCN1HM0WQdrr_aPmEMe0Cl8wizFb8WDejV5m6wCdRz6q7UI--ixUENZKNfJbNNvLQoBqJ62Y1-NBcucoIu8UxowTfx4WhFdksqOfE-uFZJ669tiXn17m2p1P7ar79sNfudY8II3sjKNBYN065RkDSqYmys7kVrYH4tv1VyGR8U72w06e5U3gprtdYZW0YXPg5Fi7Pl1DPEaVfjJKWYfqLOCn0BTeojeu4tgjkvIecs1msZjYoIN76jw",
    category: "Áo thời trang",
  },
  {
    id: "BL04",
    sku: "BLZ-OAT-09",
    name: "Áo Blazer Linen Một Lớp BL04",
    price: 495000,
    originalPrice: 650000,
    stock: 42,
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuBU1uMD3IdiOas9vgE4berSbUa9H-RZDA1K89Y8MFjeApvT_YO_I5RfzzRpiGSp0nPeZzviLB-PTmRl14w5VcIIYRS3JpNk9nMTx03LKrTQ3G5X8S-GnDl1Hb93Loh1E67idb4zaekdyjcYz_Ohl4EOn_EwFaw1I6U5vRVaGeSEDlhgW4wNjFEnXC6agB_R3H8mOWKwD9ZPcTofRj4Vaaw1X7vJkZgbs1L3zLnDDs0tB4JTD34hSNdH",
    category: "Áo khoác",
  },
  {
    id: "PK05",
    sku: "ACC-SCR-LK05",
    name: "Set Scrunchie Lụa Tơ Tằm PK05",
    price: 49000,
    originalPrice: 90000,
    stock: 200,
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuAHEgEFw8xbjCGsTfqScmEaJBAvT2TboVYA_Jkn0Ws665Lqjb-Z2111ouHvjm_6gjOU5nU6wAqd8j1WHJBhDEbouCZR35AJXowtfQftYIc-8Esk94ok9xIynEOndHhTPHNUAlBFAqhxmWiyHHl4inbNAseNCaqKukMzzSnYW5-YAx9AtxpoJCQJViuWlQkptjDrvSmkfFm0EHibxW1OXQGGrk6pUFwca52A1kJpV6Gz_yHGzhzwQm5_",
    category: "Phụ kiện",
  },
];
