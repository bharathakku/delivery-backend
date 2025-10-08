export function listVehicles(req, res) {
  const vehicles = [
    {
      id: 'two-wheeler',
      type: 'Two Wheeler',
      subtitle: 'Fast & Light',
      capacity: 'Up to 50 kg',
      description: 'Ideal for documents and small parcels',
      price: 150,
      originalPrice: 180,
      image: 'https://img.icons8.com/color/96/scooter.png',
      available: true,
      estimatedTime: '6-10 mins'
    },
    {
      id: 'three-wheeler',
      type: 'Three Wheeler',
      subtitle: 'Mid-size Deliveries',
      capacity: 'Up to 500 kg',
      description: 'Perfect for medium loads and local deliveries',
      price: 250,
      originalPrice: 280,
      image: 'https://cdn-icons-png.flaticon.com/512/6179/6179815.png',
      available: true,
      estimatedTime: '10-15 mins'
    },
    {
      id: 'heavy-truck',
      type: 'Heavy Truck',
      subtitle: 'Heavy Duty Truck',
      capacity: 'Up to 1000 kg',
      description: 'Ideal for furniture, appliances & bulk items',
      price: 495,
      originalPrice: 520,
      image: 'https://cdn-icons-png.flaticon.com/512/870/870130.png',
      available: true,
      estimatedTime: '12-18 mins'
    }
  ]
  res.json(vehicles)
}


