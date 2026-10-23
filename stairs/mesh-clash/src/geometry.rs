use glam::DVec3 as Vector;

const EPSILON: f64 = 1e-9;

#[derive(Clone, Copy)]
pub struct Bounds {
    pub min: Vector,
    pub max: Vector,
}

impl Bounds {
    pub fn of(vertices: &[Vector]) -> Self {
        let mut result = Self {
            min: Vector::splat(f64::INFINITY),
            max: Vector::splat(f64::NEG_INFINITY),
        };
        for &point in vertices {
            result.min = result.min.min(point);
            result.max = result.max.max(point);
        }
        result
    }

    pub fn overlaps(self, other: Self) -> bool {
        (0..3).all(|axis| self.max[axis] > other.min[axis] && other.max[axis] > self.min[axis])
    }

    fn touches(self, other: Self) -> bool {
        (0..3).all(|axis| {
            self.max[axis] + EPSILON >= other.min[axis]
                && other.max[axis] + EPSILON >= self.min[axis]
        })
    }
}

#[derive(Clone, Copy)]
struct Plane {
    normal: Vector,
    offset: f64,
}

impl Plane {
    fn through(a: Vector, b: Vector, c: Vector) -> Self {
        let normal = (b - a).cross(c - a).normalize();
        Self {
            normal,
            offset: normal.dot(a),
        }
    }

    fn distance(self, point: Vector) -> f64 {
        let distance = self.normal.dot(point) - self.offset;
        if distance.abs() < EPSILON {
            0.0
        } else {
            distance
        }
    }
}

struct Tetrahedron {
    faces: Vec<Vec<Vector>>,
    planes: Vec<Plane>,
    triangle: [Vector; 3],
    sign: f64,
    bounds: Bounds,
}

impl Tetrahedron {
    fn new(origin: Vector, triangle: [Vector; 3]) -> Option<Self> {
        let [a, b, c] = triangle;
        let volume = (a - origin).dot((b - origin).cross(c - origin)) / 6.0;
        if volume.abs() < 1e-14 {
            return None;
        }
        let points = [origin, a, b, c];
        let mut faces = Vec::new();
        let mut planes = Vec::new();
        for (mut indices, opposite) in [
            ([1, 2, 3], 0),
            ([0, 3, 2], 1),
            ([0, 1, 3], 2),
            ([0, 2, 1], 3),
        ] {
            let mut plane =
                Plane::through(points[indices[0]], points[indices[1]], points[indices[2]]);
            if plane.distance(points[opposite]) > 0.0 {
                indices.swap(1, 2);
                plane.normal = -plane.normal;
                plane.offset = -plane.offset;
            }
            faces.push(indices.map(|index| points[index]).to_vec());
            planes.push(plane);
        }
        Some(Self {
            faces,
            planes,
            triangle,
            sign: volume.signum(),
            bounds: Bounds::of(&points),
        })
    }
}

enum Bvh {
    Leaf {
        bounds: Bounds,
        indices: Vec<usize>,
    },
    Branch {
        bounds: Bounds,
        left: Box<Bvh>,
        right: Box<Bvh>,
    },
}

impl Bvh {
    fn new(tetrahedra: &[Tetrahedron], mut indices: Vec<usize>) -> Self {
        let mut bounds = tetrahedra[indices[0]].bounds;
        for &index in &indices[1..] {
            bounds.min = bounds.min.min(tetrahedra[index].bounds.min);
            bounds.max = bounds.max.max(tetrahedra[index].bounds.max);
        }
        if indices.len() <= 4 {
            return Self::Leaf { bounds, indices };
        }
        let extent = bounds.max - bounds.min;
        let axis = if extent.x >= extent.y && extent.x >= extent.z {
            0
        } else if extent.y >= extent.z {
            1
        } else {
            2
        };
        indices.sort_by(|&a, &b| {
            let center = |i: usize| tetrahedra[i].bounds.min[axis] + tetrahedra[i].bounds.max[axis];
            center(a).total_cmp(&center(b))
        });
        let rest = indices.split_off(indices.len() / 2);
        Self::Branch {
            bounds,
            left: Box::new(Self::new(tetrahedra, indices)),
            right: Box::new(Self::new(tetrahedra, rest)),
        }
    }

    fn bounds(&self) -> Bounds {
        match self {
            Self::Leaf { bounds, .. } | Self::Branch { bounds, .. } => *bounds,
        }
    }

    fn visit_pairs(&self, other: &Self, visit: &mut impl FnMut(usize, usize)) {
        if !self.bounds().touches(other.bounds()) {
            return;
        }
        match (self, other) {
            (
                Self::Leaf { indices: first, .. },
                Self::Leaf {
                    indices: second, ..
                },
            ) => {
                for &a in first {
                    for &b in second {
                        visit(a, b);
                    }
                }
            }
            (Self::Branch { left, right, .. }, _) => {
                left.visit_pairs(other, visit);
                right.visit_pairs(other, visit);
            }
            (_, Self::Branch { left, right, .. }) => {
                self.visit_pairs(left, visit);
                self.visit_pairs(right, visit);
            }
        }
    }
}

pub struct Mesh {
    tetrahedra: Vec<Tetrahedron>,
    tree: Bvh,
    pub bounds: Bounds,
}

impl Mesh {
    pub fn new(vertices: &[Vector], indices: &[[u32; 3]]) -> Self {
        let bounds = Bounds::of(vertices);
        let origin = bounds.min + (bounds.max - bounds.min) * Vector::new(0.371, 0.417, 0.463);
        let tetrahedra: Vec<_> = indices
            .iter()
            .filter_map(|triangle| {
                Tetrahedron::new(origin, triangle.map(|index| vertices[index as usize]))
            })
            .collect();
        let tree = Bvh::new(&tetrahedra, (0..tetrahedra.len()).collect());
        Self {
            tetrahedra,
            tree,
            bounds,
        }
    }
}

fn clip_polygon(
    polygon: &[Vector],
    plane: Plane,
    mut crossings: Option<&mut Vec<Vector>>,
) -> Vec<Vector> {
    let mut result = Vec::new();
    for (index, &a) in polygon.iter().enumerate() {
        let b = polygon[(index + 1) % polygon.len()];
        let da = plane.distance(a);
        let db = plane.distance(b);
        if da <= 0.0 {
            result.push(a);
        }
        if (da < 0.0 && db > 0.0) || (da > 0.0 && db < 0.0) {
            let point = a + (b - a) * (da / (da - db));
            result.push(point);
            if let Some(points) = crossings.as_mut() {
                points.push(point);
            }
        } else if da == 0.0
            && let Some(points) = crossings.as_mut()
        {
            points.push(a);
        }
    }
    result
}

fn polygon_area(polygon: &[Vector]) -> f64 {
    if polygon.len() < 3 {
        return 0.0;
    }
    let mut cross = Vector::ZERO;
    for i in 1..polygon.len() - 1 {
        cross += (polygon[i] - polygon[0]).cross(polygon[i + 1] - polygon[0]);
    }
    cross.length() / 2.0
}

fn clipped_area(triangle: &[Vector; 3], planes: &[Plane]) -> f64 {
    let mut polygon = triangle.to_vec();
    for &plane in planes {
        polygon = clip_polygon(&polygon, plane, None);
        if polygon.len() < 3 {
            return 0.0;
        }
    }
    let coplanar = planes
        .iter()
        .any(|plane| triangle.iter().all(|&point| plane.distance(point) == 0.0));
    polygon_area(&polygon) * if coplanar { 0.5 } else { 1.0 }
}

fn intersection(first: &Tetrahedron, second: &Tetrahedron) -> (f64, Vector, f64) {
    if !first.bounds.touches(second.bounds) {
        return (0.0, Vector::ZERO, 0.0);
    }
    let mut faces = first.faces.clone();
    for &plane in &second.planes {
        let mut crossings = Vec::new();
        faces = faces
            .iter()
            .map(|face| clip_polygon(face, plane, Some(&mut crossings)))
            .filter(|face| face.len() >= 3)
            .collect();
        if faces.is_empty() {
            return (0.0, Vector::ZERO, 0.0);
        }
        let mut unique = Vec::new();
        for point in crossings {
            if !unique
                .iter()
                .any(|other: &Vector| (*other - point).length_squared() < EPSILON * EPSILON)
            {
                unique.push(point);
            }
        }
        if unique.len() >= 3 {
            let center = unique.iter().copied().sum::<Vector>() / unique.len() as f64;
            let axis = if plane.normal.x.abs() < 0.8 {
                Vector::X
            } else {
                Vector::Y
            };
            let u = plane.normal.cross(axis).normalize();
            let v = plane.normal.cross(u);
            unique.sort_by(|a, b| {
                let angle = |point: &Vector| (point - center).dot(v).atan2((point - center).dot(u));
                angle(a).total_cmp(&angle(b))
            });
            // An existing face on the clip plane already closes the solid.
            if !faces
                .iter()
                .any(|face| face.iter().all(|&point| plane.distance(point) == 0.0))
            {
                faces.push(unique);
            }
        }
    }
    let origin = faces[0][0];
    let mut volume = 0.0;
    let mut moment = Vector::ZERO;
    for face in &faces {
        for i in 1..face.len() - 1 {
            let (a, b, c) = (face[0], face[i], face[i + 1]);
            let tetra_volume = (a - origin).dot((b - origin).cross(c - origin)) / 6.0;
            volume += tetra_volume;
            moment += ((origin + a + b + c) / 4.0) * tetra_volume;
        }
    }
    let area = clipped_area(&first.triangle, &second.planes) * second.sign
        + clipped_area(&second.triangle, &first.planes) * first.sign;
    let sign = first.sign * second.sign;
    (volume * sign, moment * sign, area)
}

pub fn signed_volume(vertices: &[Vector], indices: &[[u32; 3]]) -> f64 {
    let origin = vertices[indices[0][0] as usize];
    indices
        .iter()
        .map(|triangle| {
            let [a, b, c] = triangle.map(|index| vertices[index as usize] - origin);
            a.dot(b.cross(c)) / 6.0
        })
        .sum()
}

pub fn inset_vertices(
    vertices: &[Vector],
    indices: &[[u32; 3]],
    inset: f64,
) -> Result<Vec<Vector>, String> {
    if inset == 0.0 {
        return Ok(vertices.to_vec());
    }
    let mut normals: Vec<Vec<Vector>> = vec![Vec::new(); vertices.len()];
    for triangle in indices {
        let [a, b, c] = triangle.map(|index| vertices[index as usize]);
        let normal = (b - a).cross(c - a).normalize();
        for &index in triangle {
            let faces = &mut normals[index as usize];
            if !faces.contains(&normal) {
                faces.push(normal);
            }
        }
    }
    let mut result = Vec::with_capacity(vertices.len());
    for (&vertex, faces) in vertices.iter().zip(&normals) {
        let mut direction = Vector::ZERO;
        // Project onto the face-clearance halfspaces, keeping shared vertices welded.
        for _ in 0..256 {
            for normal in faces {
                let distance = normal.dot(direction);
                if distance < 1.0 {
                    direction += normal * (1.0 - distance);
                }
            }
            if faces
                .iter()
                .all(|normal| normal.dot(direction) >= 1.0 - 1e-8)
            {
                break;
            }
        }
        let minimum = faces
            .iter()
            .map(|normal| normal.dot(direction))
            .fold(f64::INFINITY, f64::min);
        if !minimum.is_finite() || minimum <= 1e-10 {
            return Err(format!(
                "Cannot inset vertex {vertex:?} along all its incident faces."
            ));
        }
        result.push(vertex - direction * (inset / minimum));
    }
    for triangle in indices {
        let [a, b, c] = triangle.map(|index| vertices[index as usize]);
        let [p, q, r] = triangle.map(|index| result[index as usize]);
        let cross = (q - p).cross(r - p);
        if !cross.is_finite() || cross.dot((b - a).cross(c - a)) <= 0.0 {
            return Err("Inset collapses or reverses a triangle; reduce --inset.".into());
        }
    }
    if signed_volume(&result, indices) <= 0.0 {
        return Err("Inset consumes the solid; reduce --inset.".into());
    }
    Ok(result)
}

pub fn overlap(
    first: &Mesh,
    second: &Mesh,
    tolerance: f64,
) -> Result<Option<(Vector, f64)>, String> {
    if !first.bounds.overlaps(second.bounds) {
        return Ok(None);
    }
    // A closed oriented surface is a signed tetrahedral fan, even when it is concave.
    // Integrating the products of the two winding indicators gives overlap volume.
    let mut volume = 0.0;
    let mut compensation = 0.0;
    let mut magnitude = 0.0;
    let mut moment = Vector::ZERO;
    let mut area = 0.0;
    first.tree.visit_pairs(&second.tree, &mut |a, b| {
        let (contribution, centroid, surface) =
            intersection(&first.tetrahedra[a], &second.tetrahedra[b]);
        let corrected = contribution - compensation;
        let next = volume + corrected;
        compensation = (next - volume) - corrected;
        volume = next;
        magnitude += contribution.abs();
        moment += centroid;
        area += surface;
    });
    if !volume.is_finite() || !area.is_finite() || !moment.is_finite() || !magnitude.is_finite() {
        return Err("Could not compute a finite closed overlap volume and surface area.".into());
    }
    // Signed terms cancel in empty concavities; scale roundoff to the terms, not their sum.
    let roundoff = EPSILON * magnitude;
    if volume.abs() <= roundoff {
        return Ok(None);
    }
    if volume < 0.0 || area <= 0.0 {
        return Err("Could not compute a positive closed overlap volume and surface area.".into());
    }
    let thickness = if area > EPSILON {
        2.0 * volume / area
    } else {
        0.0
    };
    Ok(if thickness > tolerance {
        Some((moment / volume, thickness))
    } else {
        None
    })
}
